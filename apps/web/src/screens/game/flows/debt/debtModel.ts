import {
  SQUARES,
  applyAction,
  isProperty,
  liquidationValue,
  outstanding,
} from "@monopoly/game-engine";
import type { GameState, PropertySquare, SquareGroup } from "@monopoly/game-engine";
import type { RedactedGameState } from "@monopoly/shared";

type Debt = RedactedGameState["debts"][number];

// The engine helpers read only `players`, `ownership`, `debts` and `turn`, which the redacted
// state keeps. The tests run them on a real engine state, so a change in the engine that needs
// `rng` or `decks` fails a test here.
const forEngine = (state: RedactedGameState) => state as unknown as GameState;

const REASONS: Record<Debt["reason"], string> = {
  tax: "Tax",
  rent: "Rent",
  card: "Card payment",
  fine: "Jail fine",
};

export const reasonLabel = (reason: Debt["reason"]): string => REASONS[reason];

export const playerName = (state: RedactedGameState, id: string): string =>
  state.players.find((p) => p.id === id)?.name ?? "a player";

/** "the bank" or the name of the player. */
export const creditorName = (state: RedactedGameState, creditor: Debt["creditor"]): string =>
  creditor.type === "bank" ? "the bank" : playerName(state, creditor.id);

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

function buildingText(houses: number): string {
  if (houses === 5) return "a hotel";
  return houses === 1 ? "1 house" : `${houses} houses`;
}

/**
 * What the debtor can sell or mortgage. The engine decides whether each action is allowed now,
 * by running it on the state, so the list never offers what the server would refuse. The money of
 * a row is the sale price or the mortgage value from the board data. Buildings come first.
 */
export function raiseOptions(state: RedactedGameState, playerId: string): RaiseOptions {
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
    const base = { square, name: info.name, group: info.group } satisfies Partial<RaiseOption>;

    if (info.kind === "street" && entry.houses > 0) {
      const result = applyAction(full, { type: "SellBuilding", playerId, square });
      sells.push({
        ...base,
        key: `sell-${square}`,
        kind: "sell",
        detail: buildingText(entry.houses),
        amount: info.buildPrice / 2,
        refusal: result.ok ? null : result.error.message,
      });
    }

    if (!entry.mortgaged) {
      const result = applyAction(full, { type: "Mortgage", playerId, square });
      if (!result.ok && result.error.code === "has_buildings") {
        hiddenMortgages++;
        continue;
      }
      mortgages.push(mortgageRow(info, base, result.ok ? null : result.error.message));
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
export function consequenceText(state: RedactedGameState, debtorId: string): string {
  const toPlayers = new Map<string, number>();
  for (const debt of state.debts) {
    if (debt.debtorId !== debtorId || debt.creditor.type !== "player") continue;
    toPlayers.set(debt.creditor.id, (toPlayers.get(debt.creditor.id) ?? 0) + debt.amount);
  }

  const cards =
    "Your Get Out of Jail Free cards go back to their decks. You leave the game and keep watching.";
  if (toPlayers.size === 0) {
    return `Everything goes to the bank: your cash, and your properties after the buildings are removed. The bank auctions the properties one by one. ${cards}`;
  }
  if (toPlayers.size === 1) {
    const [id] = [...toPlayers.keys()];
    const name = playerName(state, id ?? "");
    return `Your buildings are sold to the bank at half price. ${name} receives all your cash and all your properties (mortgaged ones stay mortgaged). ${cards}`;
  }
  const names = [...toPlayers.keys()].map((id) => playerName(state, id)).join(", ");
  return `Your buildings are sold to the bank at half price. Your cash is split between ${names} by what you owe each of them. The player owed the most receives your properties. ${cards}`;
}
