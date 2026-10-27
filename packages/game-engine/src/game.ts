import { CHANCE_CARDS, CHEST_CARDS } from "./cards.ts";
import { createRng, shuffle } from "./rng.ts";
import { MAX_PLAYERS, MIN_PLAYERS, STARTING_CASH } from "./state.ts";
import type { GameError, GameState, Player } from "./state.ts";

export interface NewPlayer {
  readonly id: string;
  readonly name: string;
}

export interface CreateGameInput {
  /** Players in any order. `createGame` shuffles them into turn order. */
  readonly players: readonly NewPlayer[];
  readonly seed: number;
}

const indexes = (length: number) => Array.from({ length }, (_, i) => i);

/** Throws a `GameError`-shaped `Error` when the input is wrong. */
export function createGame(input: CreateGameInput): GameState {
  const error = validatePlayers(input.players);
  if (error) throw new Error(`${error.code}: ${error.message}`);

  const order = shuffle(createRng(input.seed), input.players);

  const players: Player[] = order.value.map((p) => ({
    id: p.id,
    name: p.name,
    cash: STARTING_CASH,
    position: 0,
    inJail: false,
    jailTurns: 0,
    heldJailCards: [],
    active: true,
  }));

  const chance = shuffle(order.rng, indexes(CHANCE_CARDS.length));
  const chest = shuffle(chance.rng, indexes(CHEST_CARDS.length));

  return {
    version: 0,
    players,
    ownership: {},
    turn: {
      currentPlayerId: players[0]?.id ?? null,
      phase: "awaiting_roll",
      doubles: 0,
      dice: null,
    },
    decks: { chance: chance.value, chest: chest.value },
    rng: chest.rng,
  };
}

function validatePlayers(players: readonly NewPlayer[]): GameError | null {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    return {
      code: "invalid_players",
      message: `Player count must be ${MIN_PLAYERS} to ${MAX_PLAYERS}, got ${players.length}`,
    };
  }
  if (new Set(players.map((p) => p.id)).size !== players.length) {
    return { code: "invalid_players", message: "Player ids must be unique" };
  }
  return null;
}
