import { JAIL_SQUARE } from "./board.ts";
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

/** Give the turn to the next active player. A player in Jail starts in the jail phase. */
export function advanceTurn(state: GameState, events: GameEvent[]): GameState {
  const currentId = state.turn.currentPlayerId;
  const count = state.players.length;
  const index = state.players.findIndex((p) => p.id === currentId);
  for (let step = 1; step <= count; step++) {
    const next = state.players[(index + step) % count];
    if (next?.active) {
      events.push({
        type: "TurnEnded",
        playerId: currentId,
        nextPlayerId: next.id,
      });
      return {
        ...state,
        turn: {
          currentPlayerId: next.id,
          phase: next.inJail ? "awaiting_jail_choice" : "awaiting_roll",
          doubles: 0,
          dice: null,
        },
      };
    }
  }
  throw new Error("No active player");
}

/**
 * Call when a roll is fully resolved (the landing is done). A player sent to Jail loses
 * the turn at once. Doubles give another roll. Otherwise the player may end the turn.
 */
export function finishRoll(state: GameState, events: GameEvent[]): GameState {
  const player = getPlayer(state, state.turn.currentPlayerId);
  if (player.inJail) return advanceTurn(state, events);
  const dice = state.turn.dice;
  const isDouble = dice !== null && dice[0] === dice[1];
  return {
    ...state,
    turn: {
      ...state.turn,
      phase: isDouble ? "awaiting_roll" : "awaiting_end_turn",
    },
  };
}
