import { describe, expect, test } from "vite-plus/test";
import { CHANCE_CARDS, CHEST_CARDS, createGame, STARTING_CASH } from "./index.ts";
import type { GameState, NewPlayer } from "./index.ts";

const names: NewPlayer[] = [
  { id: "a", name: "Ann" },
  { id: "b", name: "Bo" },
  { id: "c", name: "Cy" },
];

function newGame(seed = 1, players = names): GameState {
  return createGame({ players, seed });
}

const order = (state: GameState) => state.players.map((p) => p.id);

describe("createGame", () => {
  test("sets up players, decks and the first turn", () => {
    const state = newGame();
    expect(state.version).toBe(0);
    expect([...order(state)].sort()).toEqual(["a", "b", "c"]);
    expect(state.players.every((p) => p.cash === STARTING_CASH && p.position === 0)).toBe(true);
    expect(state.turn).toEqual({
      currentPlayerId: order(state)[0],
      phase: "awaiting_roll",
      doubles: 0,
      dice: null,
    });
    expect(state.ownership).toEqual({});
  });

  test("decks are shuffled permutations", () => {
    const state = newGame();
    const sorted = (list: readonly number[]) => [...list].sort((x, y) => x - y);
    expect(sorted(state.decks.chance)).toEqual(sorted(CHANCE_CARDS.map((_, i) => i)));
    expect(sorted(state.decks.chest)).toEqual(sorted(CHEST_CARDS.map((_, i) => i)));
  });

  test("same seed gives the same game, and state is plain JSON", () => {
    expect(newGame(5)).toEqual(newGame(5));
    expect(newGame(5)).not.toEqual(newGame(6));
    const state = newGame(5);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  test("turn order is random but repeatable", () => {
    const orders = Array.from({ length: 100 }, (_, seed) => order(newGame(seed)).join());
    expect(new Set(orders).size).toBe(6);
    expect(orders[7]).toBe(order(newGame(7)).join());
  });

  test("every player can play first", () => {
    const firsts = Array.from({ length: 100 }, (_, seed) => newGame(seed).turn.currentPlayerId);
    expect(new Set(firsts)).toEqual(new Set(["a", "b", "c"]));
  });

  test("rejects a bad player list", () => {
    expect(() => newGame(1, [{ id: "a", name: "Ann" }])).toThrow("invalid_players");
    const many = (count: number) =>
      Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
    expect(newGame(1, many(6)).players).toHaveLength(6);
    expect(() => newGame(1, many(7))).toThrow("invalid_players");
    expect(() =>
      newGame(1, [
        { id: "a", name: "Ann" },
        { id: "a", name: "Bo" },
      ]),
    ).toThrow("unique");
  });
});
