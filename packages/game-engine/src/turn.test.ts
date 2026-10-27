import { describe, expect, test } from "vite-plus/test";
import { applyAction, createGame, GO_SALARY, rollDice } from "./index.ts";
import type { Dice, GameEvent, GameState } from "./index.ts";

type Setup = (state: GameState) => GameState;

const base = (seed: number): GameState =>
  createGame({
    seed,
    players: [
      { id: "a", name: "Ann" },
      { id: "b", name: "Bo" },
      { id: "c", name: "Cy" },
    ],
  });

const current = (state: GameState) => state.turn.currentPlayerId;
const player = (state: GameState, id: string) => {
  const found = state.players.find((p) => p.id === id);
  if (!found) throw new Error(`no player ${id}`);
  return found;
};

const setCurrent =
  (patch: Partial<GameState["players"][number]>): Setup =>
  (state) => ({
    ...state,
    players: state.players.map((p) => (p.id === current(state) ? { ...p, ...patch } : p)),
  });

/** Find a game where the next roll satisfies `wanted`. The RNG is seeded, so this is repeatable. */
function gameWhere(wanted: (dice: Dice) => boolean, ...setups: Setup[]): GameState {
  for (let seed = 0; seed < 20000; seed++) {
    const state = setups.reduce((s, setup) => setup(s), base(seed));
    if (wanted(rollDice(state.rng).value)) return state;
  }
  throw new Error("no seed found");
}

function roll(state: GameState) {
  const result = applyAction(state, { type: "RollDice", playerId: current(state) });
  if (!result.ok) throw new Error(result.error.message);
  return result;
}

const isDouble = (d: Dice) => d[0] === d[1];
const types = (events: readonly GameEvent[]) => events.map((e) => e.type);

describe("RollDice", () => {
  test("a normal roll moves the token and lets the player end the turn", () => {
    const state = gameWhere((d) => !isDouble(d));
    const id = current(state);
    const { state: after, events } = roll(state);
    const total = (after.turn.dice?.[0] ?? 0) + (after.turn.dice?.[1] ?? 0);
    expect(player(after, id).position).toBe(total);
    expect(after.turn).toMatchObject({
      currentPlayerId: id,
      phase: "awaiting_end_turn",
      doubles: 0,
    });
    expect(after.version).toBe(1);
    expect(types(events)).toEqual(["DiceRolled", "PlayerMoved"]);
  });

  test("doubles give another roll", () => {
    const state = gameWhere(isDouble);
    const { state: after } = roll(state);
    expect(after.turn).toMatchObject({
      currentPlayerId: current(state),
      phase: "awaiting_roll",
      doubles: 1,
    });
  });

  test("passing GO pays the salary and wraps the position", () => {
    const state = gameWhere((d) => !isDouble(d), setCurrent({ position: 38 }));
    const id = current(state);
    const { state: after, events } = roll(state);
    const total = (after.turn.dice?.[0] ?? 0) + (after.turn.dice?.[1] ?? 0);
    expect(player(after, id).position).toBe((38 + total) % 40);
    expect(player(after, id).cash).toBe(player(state, id).cash + GO_SALARY);
    expect(types(events)).toEqual(["DiceRolled", "PlayerMoved", "PassedGo"]);
  });

  test("landing exactly on GO pays the salary", () => {
    const state = gameWhere(
      (d) => d[0] + d[1] === 10 && !isDouble(d),
      setCurrent({ position: 30 }),
    );
    const { state: after } = roll(state);
    expect(player(after, current(state)).position).toBe(0);
    expect(player(after, current(state)).cash).toBe(player(state, current(state)).cash + GO_SALARY);
  });

  test("no salary when the token does not pass GO", () => {
    const state = gameWhere((d) => !isDouble(d), setCurrent({ position: 5 }));
    const { state: after } = roll(state);
    expect(player(after, current(state)).cash).toBe(player(state, current(state)).cash);
  });

  test("the third double in a row sends the token to Jail and ends the turn", () => {
    const withDoubles: Setup = (s) => ({ ...s, turn: { ...s.turn, doubles: 2 } });
    const state = gameWhere(isDouble, withDoubles, setCurrent({ position: 4 }));
    const id = current(state);
    const { state: after, events } = roll(state);
    expect(player(after, id)).toMatchObject({
      position: 10,
      inJail: true,
      cash: player(state, id).cash,
    });
    expect(after.turn.currentPlayerId).not.toBe(id);
    expect(after.turn).toMatchObject({ phase: "awaiting_roll", doubles: 0, dice: null });
    expect(types(events)).toEqual(["DiceRolled", "PlayerMoved", "SentToJail", "TurnEnded"]);
  });

  test("the same state and action give the same result", () => {
    const state = base(3);
    expect(roll(state)).toEqual(roll(state));
  });

  test("rolling in Jail is not built yet", () => {
    const state = gameWhere(
      () => true,
      setCurrent({ inJail: true, position: 10 }),
      (s) => ({
        ...s,
        turn: { ...s.turn, phase: "awaiting_jail_choice" },
      }),
    );
    expect(applyAction(state, { type: "RollDice", playerId: current(state) })).toMatchObject({
      ok: false,
      error: { code: "not_implemented" },
    });
  });
});

describe("EndTurn", () => {
  const ready = (state: GameState): GameState => ({
    ...state,
    turn: { ...state.turn, phase: "awaiting_end_turn", doubles: 0, dice: [1, 2] },
  });
  const end = (state: GameState) => {
    const result = applyAction(state, { type: "EndTurn", playerId: current(state) });
    if (!result.ok) throw new Error(result.error.message);
    return result;
  };

  test("passes the turn to the next player in order and resets the turn state", () => {
    const state = ready(base(1));
    const index = state.players.findIndex((p) => p.id === current(state));
    const expected = state.players[(index + 1) % 3]?.id;
    const { state: after, events } = end(state);
    expect(after.turn).toEqual({
      currentPlayerId: expected,
      phase: "awaiting_roll",
      doubles: 0,
      dice: null,
    });
    expect(events).toEqual([
      { type: "TurnEnded", playerId: current(state), nextPlayerId: expected },
    ]);
  });

  test("skips eliminated players and wraps around", () => {
    const state = ready(base(1));
    const index = state.players.findIndex((p) => p.id === current(state));
    const skipped = state.players[(index + 1) % 3]?.id;
    const target = state.players[(index + 2) % 3]?.id;
    const without: GameState = {
      ...state,
      players: state.players.map((p) => (p.id === skipped ? { ...p, active: false } : p)),
    };
    expect(end(without).state.turn.currentPlayerId).toBe(target);
  });

  test("a next player in Jail starts in the jail phase", () => {
    const state = ready(base(1));
    const index = state.players.findIndex((p) => p.id === current(state));
    const next = state.players[(index + 1) % 3]?.id;
    const jailed: GameState = {
      ...state,
      players: state.players.map((p) => (p.id === next ? { ...p, inJail: true, position: 10 } : p)),
    };
    expect(end(jailed).state.turn).toMatchObject({
      currentPlayerId: next,
      phase: "awaiting_jail_choice",
    });
  });

  test("a full lap returns to the first player", () => {
    let state = ready(base(2));
    const first = current(state);
    for (let i = 0; i < 3; i++) state = ready(end(state).state);
    expect(current(state)).toBe(first);
  });
});
