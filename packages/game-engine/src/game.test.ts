import { describe, expect, test } from "vite-plus/test";
import { CHANCE_CARDS, CHEST_CARDS, createGame, rollForOrder, STARTING_CASH } from "./index.ts";
import type { GameEvent, GameState, NewPlayer } from "./index.ts";

const names: NewPlayer[] = [
  { id: "a", name: "Ann" },
  { id: "b", name: "Bo" },
  { id: "c", name: "Cy" },
];

function newGame(seed = 1, players = names): GameState {
  return createGame({ players, seed });
}

/** Play the whole opening roll. Each round, every contender rolls in seat order. */
function playRollOff(initial: GameState) {
  let state = initial;
  const events: GameEvent[] = [];
  while (state.setup) {
    for (const id of state.setup.contenders) {
      const result = rollForOrder(state, id);
      if (!result.ok) throw new Error(result.error.message);
      state = result.state;
      events.push(...result.events);
    }
  }
  return { state, events };
}

describe("createGame", () => {
  test("sets up players, decks and the opening roll", () => {
    const state = newGame();
    expect(state.version).toBe(0);
    expect(state.players.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(state.players.every((p) => p.cash === STARTING_CASH && p.position === 0)).toBe(true);
    expect(state.turn.phase).toBe("setup_roll");
    expect(state.setup?.contenders).toEqual(["a", "b", "c"]);
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

  test("rejects a bad player list", () => {
    expect(() => newGame(1, [{ id: "a", name: "Ann" }])).toThrow("invalid_players");
    expect(() =>
      newGame(1, [
        { id: "a", name: "Ann" },
        { id: "a", name: "Bo" },
      ]),
    ).toThrow("unique");
  });
});

describe("rollForOrder", () => {
  test("rejects unknown, repeated and late rolls", () => {
    const state = newGame();
    const first = rollForOrder(state, "a");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(rollForOrder(first.state, "a")).toMatchObject({
      ok: false,
      error: { code: "already_rolled" },
    });
    expect(rollForOrder(state, "zz")).toMatchObject({
      ok: false,
      error: { code: "unknown_player" },
    });
    const done = playRollOff(state).state;
    expect(rollForOrder(done, "a")).toMatchObject({ ok: false, error: { code: "wrong_phase" } });
  });

  test("does not change the input state and raises the version", () => {
    const state = newGame();
    const snapshot = JSON.parse(JSON.stringify(state)) as GameState;
    const result = rollForOrder(state, "a");
    expect(state).toEqual(snapshot);
    expect(result.ok && result.state.version).toBe(1);
  });

  test("the highest total plays first, for many seeds", () => {
    const outcomes = Array.from({ length: 200 }, (_, seed) => {
      const { state, events } = playRollOff(newGame(seed));
      const decided = events.filter((e) => e.type === "TurnOrderDecided");
      return { state, decided };
    });
    expect(outcomes.every((o) => o.state.turn.phase === "awaiting_roll")).toBe(true);
    expect(outcomes.every((o) => o.state.setup === null)).toBe(true);
    expect(outcomes.every((o) => o.decided.length === 1)).toBe(true);
    expect(
      outcomes.every((o) => o.decided[0]?.firstPlayerId === o.state.turn.currentPlayerId),
    ).toBe(true);
    // Seat order does not change.
    expect(outcomes.every((o) => o.state.players.map((p) => p.id).join() === "a,b,c")).toBe(true);
  });

  test("tied players re-roll among themselves", () => {
    const tied = Array.from({ length: 200 }, (_, seed) => playRollOff(newGame(seed))).flatMap(
      ({ events }) => events.filter((e) => e.type === "OrderTied"),
    );
    expect(tied.length).toBeGreaterThan(0);
    expect(tied.every((e) => e.playerIds.length >= 2)).toBe(true);
  });

  test("a non-tied player cannot roll in the re-roll round", () => {
    const found = Array.from({ length: 200 }, (_, seed) => newGame(seed))
      .map((initial) => {
        let state = initial;
        for (const id of ["a", "b", "c"]) {
          const result = rollForOrder(state, id);
          if (!result.ok) throw new Error(result.error.message);
          state = result.state;
        }
        return state;
      })
      .find((s) => s.setup !== null && s.setup.contenders.length < 3);
    expect(found).toBeDefined();
    const outsider = ["a", "b", "c"].find((id) => !found?.setup?.contenders.includes(id)) ?? "";
    expect(found && rollForOrder(found, outsider)).toMatchObject({
      ok: false,
      error: { code: "not_a_contender" },
    });
  });
});
