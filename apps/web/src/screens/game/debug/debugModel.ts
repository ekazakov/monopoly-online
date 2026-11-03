import { ALLOWED_PHASES, isProperty, SQUARES } from "@monopoly/game-engine";
import type { DebugChange, Game, RedactedGameState, Seat } from "@monopoly/shared";
import { seatThatMayAct } from "../../../game/selectors.ts";

/** Who may edit now, or why nobody on this device may. */
export type DebugAccess = { seat: Seat; reason: null } | { seat: null; reason: string };

/**
 * The debug panel works for the player on turn, in the phases the engine allows. A buy offer, an
 * auction or a trade must finish first, because an edit could change what they refer to.
 */
export function debugAccess(
  game: Game | null,
  state: RedactedGameState | null,
  userId: string,
): DebugAccess {
  if (!state || state.turn.phase === "game_over") {
    return { seat: null, reason: "The game is over." };
  }
  if (!ALLOWED_PHASES.DebugEdit.includes(state.turn.phase)) {
    return { seat: null, reason: "Not available now. Finish the offer, auction or trade first." };
  }
  const seat = seatThatMayAct(game, state, userId, "DebugEdit");
  return seat ? { seat, reason: null } : { seat: null, reason: "Wait for your turn." };
}

export interface SquareOption {
  square: number;
  name: string;
}

/** Every square, for the token move. */
export const SQUARE_OPTIONS: readonly SquareOption[] = SQUARES.map((s, square) => ({
  square,
  name: s.name,
}));

export interface DeedOption extends SquareOption {
  /** Only streets have buildings. */
  street: boolean;
}

/** Every deed on the board, in board order. */
export const DEED_OPTIONS: readonly DeedOption[] = SQUARES.flatMap((s, square) =>
  isProperty(s) ? [{ square, name: s.name, street: s.kind === "street" }] : [],
);

export interface DeedDraft {
  /** A player id, or "" for the bank. */
  ownerId: string;
  houses: number;
  mortgaged: boolean;
}

/** The form values for a deed, filled from its current state. */
export function deedDraft(state: RedactedGameState | null, square: number): DeedDraft {
  const entry = state?.ownership[String(square)];
  return entry
    ? { ownerId: entry.ownerId, houses: entry.houses, mortgaged: entry.mortgaged }
    : { ownerId: "", houses: 0, mortgaged: false };
}

/** The change a deed form sends. A bank deed has no buildings and no mortgage. */
export function deedChange(square: number, draft: DeedDraft): DebugChange {
  if (draft.ownerId === "") {
    return { kind: "deed", square, ownerId: null, houses: 0, mortgaged: false };
  }
  return {
    kind: "deed",
    square,
    ownerId: draft.ownerId,
    houses: draft.mortgaged ? 0 : draft.houses,
    mortgaged: draft.mortgaged,
  };
}

/** A typed cash value, or null when it is not a whole number of 0 or more. */
export function parseCash(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const value = Number(text.trim());
  return Number.isSafeInteger(value) ? value : null;
}

export const buildingLabel = (houses: number) =>
  houses === 0 ? "None" : houses === 5 ? "Hotel" : `${houses} house${houses === 1 ? "" : "s"}`;
