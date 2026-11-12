import {
  SQUARES,
  applyAction,
  isProperty,
  liquidationValue,
  outstanding,
} from "@monopoly/game-engine";
import type { GameState, PropertySquare, SquareGroup } from "@monopoly/game-engine";
import type { RedactedGameState } from "@monopoly/shared";
import { errorMessage, squareName } from "../../../../i18n/index.ts";
import type { Translate } from "../../../../i18n/index.ts";

type Debt = RedactedGameState["debts"][number];

// The engine helpers read only `players`, `ownership`, `debts` and `turn`, which the redacted
// state keeps. The tests run them on a real engine state, so a change in the engine that needs
// `rng` or `decks` fails a test here.
const forEngine = (state: RedactedGameState) => state as unknown as GameState;

export const reasonLabel = (reason: Debt["reason"], t: Translate): string =>
  t(`debt.reason.${reason}`);

export const playerName = (state: RedactedGameState, id: string, t: Translate): string =>
  state.players.find((p) => p.id === id)?.name ?? t("debt.aPlayer");

/** "the bank" or the name of the player. */
export const creditorName = (
  state: RedactedGameState,
  creditor: Debt["creditor"],
  t: Translate,
): string => (creditor.type === "bank" ? t("debt.theBank") : playerName(state, creditor.id, t));

export interface DebtSummary {
  debtorId: string;
  debtorName: string;
  cash: number;
  /** The debt that `PayDebt` pays now: the oldest. */
  first: Debt;
  /** The debts that wait behind it, oldest first. */
  later: Debt[];
  /** What is missing for `PayDebt`. Zero or less when cash covers the first debt. */
  shortfall: number;
  /** The assets cannot cover all debts, even when the player sells everything. */
  hopeless: boolean;
}

/** The debts of the player on turn, or null when there are none. */
export function summarizeDebt(state: RedactedGameState): DebtSummary | null {
  const debtorId = state.turn.currentPlayerId;
  const debts = state.debts.filter((d) => d.debtorId === debtorId);
  const [first, ...later] = debts;
  const player = state.players.find((p) => p.id === debtorId);
  if (!first || !player) return null;
  return {
    debtorId,
    debtorName: player.name,
    cash: player.cash,
    first,
    later,
    shortfall: first.amount - player.cash,
    hopeless:
      liquidationValue(forEngine(state), debtorId) < outstanding(forEngine(state), debtorId),
  };
}

export interface RaiseOption {
  key: string;
  kind: "sell" | "mortgage";
  square: number;
  name: string;
  group: SquareGroup;
  /** "2 houses", "a hotel" or the empty string. */
  detail: string;
  /** The cash the action brings in, from the board data. */
  amount: number;
  /** The engine's reason when it refuses the action now, otherwise null. */
  refusal: string | null;
}

export interface RaiseOptions {
  options: RaiseOption[];
  /** Mortgages left out because the colour group still has buildings. Selling them comes first. */
  hiddenMortgages: number;
}

function buildingText(houses: number, t: Translate): string {
  if (houses === 5) return t("debt.aHotel");
  return t("count.houses", { count: houses });
}

/** Why the engine refused a raise: selling and mortgaging have their own wording for uneven sales. */
function refusalText(error: { code: string; message: string }, t: Translate): string {
  return error.code === "uneven_build" ? t("debt.evenSell") : errorMessage(error, t);
}

/**
 * What the debtor can sell or mortgage. The engine decides whether each action is allowed now,
 * by running it on the state, so the list never offers what the server would refuse. The money of
 * a row is the sale price or the mortgage value from the board data. Buildings come first.
 */
export function raiseOptions(
  state: RedactedGameState,
  playerId: string,
  t: Translate,
): RaiseOptions {
  const full = forEngine(state);
  const sells: RaiseOption[] = [];
  const mortgages: RaiseOption[] = [];
  let hiddenMortgages = 0;

  const owned = Object.entries(state.ownership)
    .filter(([, entry]) => entry.ownerId === playerId)
    .map(([square, entry]) => ({ square: Number(square), entry }))
    .sort((a, b) => a.square - b.square);

  for (const { square, entry } of owned) {
    const info = SQUARES[square];
    if (!info || !isProperty(info)) continue;
    const base = {
      square,
      name: squareName(square, t),
      group: info.group,
    } satisfies Partial<RaiseOption>;

    if (info.kind === "street" && entry.houses > 0) {
      const result = applyAction(full, { type: "SellBuilding", playerId, square });
      sells.push({
        ...base,
        key: `sell-${square}`,
        kind: "sell",
        detail: buildingText(entry.houses, t),
        amount: info.buildPrice / 2,
        refusal: result.ok ? null : refusalText(result.error, t),
      });
    }

    if (!entry.mortgaged) {
      const result = applyAction(full, { type: "Mortgage", playerId, square });
      if (!result.ok && result.error.code === "has_buildings") {
        hiddenMortgages++;
        continue;
      }
      mortgages.push(mortgageRow(info, base, result.ok ? null : refusalText(result.error, t)));
    }
  }

  return { options: [...sells, ...mortgages], hiddenMortgages };
}

function mortgageRow(
  info: PropertySquare,
  base: { square: number; name: string; group: SquareGroup },
  refusal: string | null,
): RaiseOption {
  return {
    ...base,
    key: `mortgage-${base.square}`,
    kind: "mortgage",
    detail: "",
    amount: info.mortgage,
    refusal,
  };
}

/** What a bankruptcy of the debtor does, from the rules (12): the creditor or the bank gets it all. */
export function consequenceText(state: RedactedGameState, debtorId: string, t: Translate): string {
  const toPlayers = new Map<string, number>();
  for (const debt of state.debts) {
    if (debt.debtorId !== debtorId || debt.creditor.type !== "player") continue;
    toPlayers.set(debt.creditor.id, (toPlayers.get(debt.creditor.id) ?? 0) + debt.amount);
  }

  const cards = t("debt.consequence.cards");
  if (toPlayers.size === 0) return t("debt.consequence.bank", { cards });
  if (toPlayers.size === 1) {
    const [id] = [...toPlayers.keys()];
    const name = playerName(state, id ?? "", t);
    return t("debt.consequence.one", { name, cards });
  }
  const names = [...toPlayers.keys()].map((id) => playerName(state, id, t)).join(", ");
  return t("debt.consequence.many", { names, cards });
}
