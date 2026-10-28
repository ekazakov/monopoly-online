import { applyAction, createGame, rollDice } from "./index.ts";
import type { Dice, GameEvent, GameState } from "./index.ts";

export type Setup = (state: GameState) => GameState;

export const base = (seed: number): GameState =>
  createGame({
    seed,
    players: [
      { id: "a", name: "Ann" },
      { id: "b", name: "Bo" },
      { id: "c", name: "Cy" },
    ],
  });

export const current = (state: GameState) => state.turn.currentPlayerId;
export const player = (state: GameState, id: string) => {
  const found = state.players.find((p) => p.id === id);
  if (!found) throw new Error(`no player ${id}`);
  return found;
};

export const setCurrent =
  (patch: Partial<GameState["players"][number]>): Setup =>
  (state) => ({
    ...state,
    players: state.players.map((p) => (p.id === current(state) ? { ...p, ...patch } : p)),
  });

/** Find a game where the next roll satisfies `wanted`. The RNG is seeded, so this is repeatable. */
export function gameWhere(wanted: (dice: Dice) => boolean, ...setups: Setup[]): GameState {
  for (let seed = 0; seed < 20000; seed++) {
    const state = setups.reduce((s, setup) => setup(s), base(seed));
    if (wanted(rollDice(state.rng).value)) return state;
  }
  throw new Error("no seed found");
}

export function roll(state: GameState) {
  const result = applyAction(state, { type: "RollDice", playerId: current(state) });
  if (!result.ok) throw new Error(result.error.message);
  return result;
}

export const isDouble = (d: Dice) => d[0] === d[1];
export const types = (events: readonly GameEvent[]) => events.map((e) => e.type);

/** Make the first player who is not the current player own these squares. */
export const owns =
  (...squares: number[]): Setup =>
  (state) => {
    const owner = state.players.find((p) => p.id !== current(state))?.id ?? "";
    return {
      ...state,
      ownership: {
        ...state.ownership,
        ...Object.fromEntries(
          squares.map((s) => [String(s), { ownerId: owner, houses: 0, mortgaged: false }]),
        ),
      },
    };
  };

export const ownerId = (state: GameState) =>
  state.players.find((p) => p.id !== current(state))?.id ?? "";

/** A game where the current player starts on `start` and the next roll is a non-double `total`. */
export const landing = (start: number, total: number, ...setups: Setup[]) =>
  gameWhere(
    (d) => !isDouble(d) && d[0] + d[1] === total,
    setCurrent({ position: start }),
    ...setups,
  );

/** Put a card on top of a deck. */
export const topCard =
  (deck: "chance" | "chest", cardIndex: number): Setup =>
  (state) => ({
    ...state,
    decks: {
      ...state.decks,
      [deck]: [cardIndex, ...state.decks[deck].filter((i) => i !== cardIndex)],
    },
  });

export interface DeedSetup {
  houses?: number;
  mortgaged?: boolean;
}

/**
 * Give deeds to `"other"` (the first player who is not the current player) or `"current"`.
 * Each entry is a square with optional houses and a mortgage flag.
 */
export const holding =
  (who: "other" | "current", deeds: Record<number, DeedSetup>): Setup =>
  (state) => {
    const owner = who === "current" ? current(state) : ownerId(state);
    return {
      ...state,
      ownership: {
        ...state.ownership,
        ...Object.fromEntries(
          Object.entries(deeds).map(([square, deed]) => [
            square,
            { ownerId: owner, houses: deed.houses ?? 0, mortgaged: deed.mortgaged ?? false },
          ]),
        ),
      },
    };
  };
