import { JAIL_SQUARE } from "./board.ts";
import { GO_SALARY } from "./state.ts";
import type { GameEvent, GameState, Player } from "./state.ts";

export function getPlayer(state: GameState, playerId: string): Player {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error(`Unknown player: ${playerId}`);
  return player;
}

export function updatePlayer(
  state: GameState,
  playerId: string,
  patch: Partial<Player>,
): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, ...patch } : p)),
  };
}

/** Move the token straight to Jail. No GO salary. Does not end the turn. */
export function sendToJail(state: GameState, playerId: string, events: GameEvent[]): GameState {
  const from = getPlayer(state, playerId).position;
  events.push({ type: "PlayerMoved", playerId, from, to: JAIL_SQUARE });
  events.push({ type: "SentToJail", playerId });
  return updatePlayer(state, playerId, {
    position: JAIL_SQUARE,
    inJail: true,
    jailTurns: 0,
  });
}

/** Take money from a player. Returns null when the player cannot pay. */
export function charge(state: GameState, playerId: string, amount: number): GameState | null {
  const player = getPlayer(state, playerId);
  if (player.cash < amount) return null;
  return updatePlayer(state, playerId, { cash: player.cash - amount });
}

/** Move a token to a square. Pays the GO salary when `collectGo` is true. */
export function movePlayer(
  state: GameState,
  playerId: string,
  to: number,
  events: GameEvent[],
  collectGo: boolean,
): GameState {
  const player = getPlayer(state, playerId);
  events.push({ type: "PlayerMoved", playerId, from: player.position, to });
  const moved = updatePlayer(state, playerId, { position: to });
  if (!collectGo) return moved;
  events.push({ type: "PassedGo", playerId, amount: GO_SALARY });
  return updatePlayer(moved, playerId, { cash: player.cash + GO_SALARY });
}
