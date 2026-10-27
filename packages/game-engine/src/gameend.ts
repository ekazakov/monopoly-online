import type { GameEvent, GameState, Success } from "./state.ts";

/**
 * The game ends when one active player is left, and that player wins.
 * Call after each accepted action. Returns the state and events, with the end added if it applies.
 */
export function checkGameEnd(state: GameState, events: readonly GameEvent[]): Success {
  const active = state.players.filter((p) => p.active);
  const winner = active[0];
  if (state.turn.phase === "game_over" || active.length !== 1 || !winner) {
    return { ok: true, state, events };
  }
  return {
    ok: true,
    state: { ...state, turn: { ...state.turn, phase: "game_over" } },
    events: [...events, { type: "GameEnded", winnerId: winner.id }],
  };
}
