import {
  ALLOWED_PHASES,
  SQUARES,
  groupSquares,
  handleProposeTrade,
  isProperty,
} from "@monopoly/game-engine";
import type { GameState, SquareGroup } from "@monopoly/game-engine";
import type { DeckName, Game, RedactedGameState, TradeOffer } from "@monopoly/shared";
import { seatThatMayAct } from "../../../../game/index.ts";
import type { Turn } from "../../turn/index.ts";
import { errorMessage, squareName } from "../../../../i18n/index.ts";
import type { Translate } from "../../../../i18n/index.ts";
import { formatMoney } from "../../turn/format.ts";

type Player = RedactedGameState["players"][number];

// The engine trade check reads only `players`, `ownership` and `turn`, which the redacted state
// keeps. If a change in the engine needs `rng` or `decks`, the drift test of this module fails.
const forEngine = (state: RedactedGameState) => state as unknown as GameState;

export const jailCardLabel = (deck: DeckName, t: Translate) =>
  t("trade.jailCard", { deck: t(`deck.${deck}`) });

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export interface OwnedProperty {
  square: number;
  name: string;
  group: SquareGroup;
  price: number;
  mortgaged: boolean;
  /** 0 to 4 houses, 5 for a hotel. */
  houses: number;
  /** Why the property cannot be traded now, or null. */
  locked: string | null;
}

/** Whether any street of the colour group has buildings. Then no property of the group can move. */
function groupHasBuildings(state: RedactedGameState, group: SquareGroup): boolean {
  return groupSquares(group).some((square) => (state.ownership[String(square)]?.houses ?? 0) > 0);
}

/** The properties a player owns, in board order, with the reason one cannot be traded. */
export function ownedProperties(
  state: RedactedGameState,
  playerId: string,
  t: Translate,
): OwnedProperty[] {
  const result: OwnedProperty[] = [];
  SQUARES.forEach((info, square) => {
    const entry = state.ownership[String(square)];
    if (!entry || entry.ownerId !== playerId || !isProperty(info)) return;
    result.push({
      square,
      name: squareName(square, t),
      group: info.group,
      price: info.price,
      mortgaged: entry.mortgaged,
      houses: entry.houses,
      locked: groupHasBuildings(state, info.group) ? t("trade.locked") : null,
    });
  });
  return result;
}

/** The text that follows a property name in a list: buildings and mortgage. */
export function propertyNote(
  property: Pick<OwnedProperty, "houses" | "mortgaged">,
  t: Translate,
): string {
  const parts: string[] = [];
  if (property.houses === 5) parts.push(t("hand.hotel"));
  else if (property.houses > 0) parts.push(t("trade.houses", { count: property.houses }));
  if (property.mortgaged) parts.push(t("hand.mortgaged"));
  return parts.join(", ");
}

/** What one side of the builder holds before it becomes a `TradeOffer`. */
export interface SideDraft {
  /** The text of the cash field. */
  cash: string;
  squares: readonly number[];
  /** Positions in `heldJailCards` of the player. */
  jailCards: readonly number[];
}

export const emptySide: SideDraft = { cash: "", squares: [], jailCards: [] };

/** The cash field as a whole number, or null when the text is not one. An empty field is 0. */
export function parseCash(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

export interface SideCheck {
  offer: TradeOffer | null;
  /** The reason the cash is not allowed, or null. */
  cashProblem: string | null;
}

/** Turns the draft of one side into an offer. Squares that cannot be traded now are dropped. */
export function checkSide(
  state: RedactedGameState,
  owner: Player,
  draft: SideDraft,
  t: Translate,
): SideCheck {
  const cash = parseCash(draft.cash);
  if (cash === null) {
    return { offer: null, cashProblem: t("trade.cashWhole") };
  }
  if (cash > owner.cash) {
    return {
      offer: null,
      cashProblem: t("trade.cashOnly", { name: owner.name, cash: formatMoney(owner.cash) }),
    };
  }
  const tradable = new Set(
    ownedProperties(state, owner.id, t)
      .filter((property) => property.locked === null)
      .map((property) => property.square),
  );
  return {
    offer: {
      cash,
      squares: draft.squares.filter((square) => tradable.has(square)).sort((a, b) => a - b),
      jailCards: draft.jailCards
        .filter((index) => index < owner.heldJailCards.length)
        .sort((a, b) => a - b)
        .map((index) => owner.heldJailCards[index] as DeckName),
    },
    cashProblem: null,
  };
}

export interface TradeCheck {
  give: TradeOffer | null;
  get: TradeOffer | null;
  giveCashProblem: string | null;
  getCashProblem: string | null;
  /** Why Propose is disabled, or null when the trade can be sent. */
  blocker: string | null;
}

export const isEmptyOffer = (offer: TradeOffer) =>
  offer.cash === 0 && offer.squares.length === 0 && offer.jailCards.length === 0;

/**
 * Checks the draft of both sides like the engine does. The sides are checked here for friendly
 * texts. The engine check runs last, so a rule that changes there still blocks the button.
 */
export function checkTrade(
  state: RedactedGameState,
  proposer: Player,
  partner: Player | null,
  giveDraft: SideDraft,
  getDraft: SideDraft,
  t: Translate,
): TradeCheck {
  const giveSide = checkSide(state, proposer, giveDraft, t);
  const getSide = partner
    ? checkSide(state, partner, getDraft, t)
    : { offer: null, cashProblem: null };
  const result: TradeCheck = {
    give: giveSide.offer,
    get: getSide.offer,
    giveCashProblem: giveSide.cashProblem,
    getCashProblem: getSide.cashProblem,
    blocker: null,
  };
  if (!partner) return { ...result, blocker: t("trade.choose") };
  if (!giveSide.offer || !getSide.offer) {
    return { ...result, blocker: giveSide.cashProblem ?? getSide.cashProblem };
  }
  if (isEmptyOffer(giveSide.offer) && isEmptyOffer(getSide.offer)) {
    return { ...result, blocker: t("trade.addSomething") };
  }
  const engine = handleProposeTrade(forEngine(state), {
    type: "ProposeTrade",
    playerId: proposer.id,
    toPlayerId: partner.id,
    give: giveSide.offer,
    get: getSide.offer,
  });
  return { ...result, blocker: engine.ok ? null : errorMessage(engine.error, t) };
}

/** Phases in which the engine accepts `ProposeTrade`. */
export const PROPOSE_PHASES = ALLOWED_PHASES.ProposeTrade;

/**
 * The seat of this device that may propose a trade now, or null. The engine `mayAct` ignores the
 * phase, so the phase list of the action is checked here. A trade also needs a partner.
 */
export function proposingSeat(
  game: Game | null,
  state: RedactedGameState | null,
  userId: string | null,
) {
  if (!state || !PROPOSE_PHASES.includes(state.turn.phase)) return null;
  const seat = seatThatMayAct(game, state, userId, "ProposeTrade");
  if (!seat) return null;
  const hasPartner = state.players.some((p) => p.active && p.id !== seat.id);
  return hasPartner ? seat : null;
}

/** Whether the turn area should offer the Trade button to this device now. */
export const canProposeTrade = (turn: Turn): boolean =>
  !turn.pending && proposingSeat(turn.view.game, turn.view.state, turn.userId) !== null;

/** "2 properties + $50 + 1 jail card", or "nothing". */
export function summariseOffer(offer: TradeOffer, t: Translate): string {
  const parts: string[] = [];
  if (offer.squares.length > 0) parts.push(t("count.properties", { count: offer.squares.length }));
  if (offer.cash > 0) parts.push(formatMoney(offer.cash));
  if (offer.jailCards.length > 0) {
    parts.push(t("count.jailCards", { count: offer.jailCards.length }));
  }
  return parts.length > 0 ? parts.join(" + ") : t("trade.nothing");
}
