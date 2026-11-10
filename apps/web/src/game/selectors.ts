import { actorFor, mayAct as engineMayAct } from "@monopoly/game-engine";
import type { ActionType, GameState } from "@monopoly/game-engine";
import type { Game, Phase, RedactedGameState, Seat } from "@monopoly/shared";

type Player = RedactedGameState["players"][number];

// The engine helpers read only `turn`, `auction` and `trade`, which the redacted state keeps.
// The drift test of the selectors checks them against a full engine state, so a change in the
// engine that needs `rng` or `decks` fails a test here.
const forEngine = (state: RedactedGameState) => state as unknown as GameState;

export function phase(state: RedactedGameState | null): Phase | null {
  return state?.turn.phase ?? null;
}

/** The player whose turn it is. In `game_over` it is the winner. */
export function currentPlayer(state: RedactedGameState | null): Player | null {
  if (!state) return null;
  return state.players.find((p) => p.id === state.turn.currentPlayerId) ?? null;
}

/** Seats the signed-in user controls: their own seat and the hot-seat seats they added. */
export function mySeats(game: Game | null, userId: string | null): Seat[] {
  if (!game || !userId) return [];
  return game.seats.filter((seat) =>
    seat.kind === "user" ? seat.userId === userId : seat.controllerUserId === userId,
  );
}

/** The seat that must act now: the bidder, the trade partner or the player on turn. */
export function actingSeat(game: Game | null, state: RedactedGameState | null): Seat | null {
  if (!game || !state || state.turn.phase === "game_over") return null;
  const actorId = actorFor(forEngine(state));
  return game.seats.find((seat) => seat.id === actorId) ?? null;
}

/**
 * Whether this seat may do an action now, by the engine `mayAct` rules. Without `type` it asks
 * whether the seat must act now (the usual turn controls). An eliminated seat never may.
 */
export function mayActWith(
  game: Game | null,
  state: RedactedGameState | null,
  seatId: string,
  type?: ActionType,
): boolean {
  if (!game || !state || state.turn.phase === "game_over") return false;
  if (!game.seats.some((seat) => seat.id === seatId)) return false;
  if (!state.players.some((p) => p.id === seatId && p.active)) return false;
  if (type) return engineMayAct(forEngine(state), type, seatId);
  return actorFor(forEngine(state)) === seatId;
}

/** The first seat of this user that may do the action now, or null. */
export function seatThatMayAct(
  game: Game | null,
  state: RedactedGameState | null,
  userId: string | null,
  type?: ActionType,
): Seat | null {
  return mySeats(game, userId).find((seat) => mayActWith(game, state, seat.id, type)) ?? null;
}

export function mayAct(
  game: Game | null,
  state: RedactedGameState | null,
  userId: string | null,
  type?: ActionType,
): boolean {
  return seatThatMayAct(game, state, userId, type) !== null;
}

/** The acting seat is one of the user's seats. */
export function isMyTurn(
  game: Game | null,
  state: RedactedGameState | null,
  userId: string | null,
): boolean {
  const seat = actingSeat(game, state);
  return seat !== null && mySeats(game, userId).some((mine) => mine.id === seat.id);
}

export function isFinished(game: Game | null, state: RedactedGameState | null): boolean {
  return game?.status === "finished" || state?.turn.phase === "game_over";
}

/** The winner, or null while the game runs and when it ended with no winner. */
export function winner(state: RedactedGameState | null): Player | null {
  if (state?.turn.phase !== "game_over") return null;
  return currentPlayer(state);
}
