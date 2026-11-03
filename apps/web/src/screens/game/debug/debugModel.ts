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

export type DeedKind = "street" | "station" | "utility";

export interface DeedOption extends SquareOption {
  kind: DeedKind;
}

/** Every deed on the board, in board order. */
export const DEED_OPTIONS: readonly DeedOption[] = SQUARES.flatMap((s, square) =>
  isProperty(s) ? [{ square, name: s.name, kind: s.kind }] : [],
);

export interface DeedGroup {
  kind: DeedKind;
  label: string;
  options: readonly DeedOption[];
}

/** The deed list in groups, each in board order. */
export const DEED_GROUPS: readonly DeedGroup[] = (
  [
    ["street", "Streets"],
    ["station", "Stations"],
    ["utility", "Utilities"],
  ] as const
).map(([kind, label]) => ({ kind, label, options: DEED_OPTIONS.filter((o) => o.kind === kind) }));

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

/**
 * The changes a deed form sends, one for each chosen deed, in one batch. A bank deed has no
 * buildings and no mortgage. Only streets keep the buildings: a station or utility gets none.
 */
export function deedChanges(squares: readonly number[], draft: DeedDraft): DebugChange[] {
  return squares.map((square) => {
    if (draft.ownerId === "") {
      return { kind: "deed", square, ownerId: null, houses: 0, mortgaged: false };
    }
    const street = DEED_OPTIONS.find((o) => o.square === square)?.kind === "street";
    return {
      kind: "deed",
      square,
      ownerId: draft.ownerId,
      houses: draft.mortgaged || !street ? 0 : draft.houses,
      mortgaged: draft.mortgaged,
    };
  });
}

/** A typed cash value, or null when it is not a whole number of 0 or more. */
export function parseCash(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const value = Number(text.trim());
  return Number.isSafeInteger(value) ? value : null;
}

export const buildingLabel = (houses: number) =>
  houses === 0 ? "None" : houses === 5 ? "Hotel" : `${houses} house${houses === 1 ? "" : "s"}`;
