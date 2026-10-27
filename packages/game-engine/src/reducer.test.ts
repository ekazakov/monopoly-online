import { describe, expect, test } from "vite-plus/test";
import { createGame, createReducer, defaultHandlers, applyAction } from "./index.ts";
import type { Action, GameState, Handlers, Phase } from "./index.ts";

const game = (): GameState =>
  createGame({
    seed: 1,
    players: [
      { id: "a", name: "Ann" },
      { id: "b", name: "Bo" },
    ],
  });

const withTurn = (state: GameState, phase: Phase, currentPlayerId?: string): GameState => ({
  ...state,
  turn: { ...state.turn, phase, currentPlayerId: currentPlayerId ?? state.turn.currentPlayerId },
});

describe("applyAction validation", () => {
  test("rejects an unknown player", () => {
    const result = applyAction(game(), { type: "RollDice", playerId: "zz" });
    expect(result).toMatchObject({ ok: false, error: { code: "unknown_player" } });
  });

  test("rejects an action out of turn", () => {
    const state = game();
    const other = state.players.find((p) => p.id !== state.turn.currentPlayerId)?.id ?? "";
    const result = applyAction(state, { type: "RollDice", playerId: other });
    expect(result).toMatchObject({ ok: false, error: { code: "not_your_turn" } });
  });

  test("rejects an eliminated player", () => {
    const state = game();
    const current = state.turn.currentPlayerId ?? "";
    const eliminated = {
      ...state,
      players: state.players.map((p) => (p.id === current ? { ...p, active: false } : p)),
    };
    const result = applyAction(eliminated, { type: "RollDice", playerId: current });
    expect(result).toMatchObject({ ok: false, error: { code: "player_inactive" } });
  });

  test("rejects every action in the wrong phase", () => {
    const state = game();
    const id = state.turn.currentPlayerId ?? "";
    const actions: Action[] = [
      { type: "BuyProperty", playerId: id },
      { type: "DeclineProperty", playerId: id },
      { type: "PayJailFine", playerId: id },
      { type: "UseJailCard", playerId: id },
      { type: "EndTurn", playerId: id },
    ];
    const results = actions.map((action) => applyAction(state, action));
    expect(results.every((r) => !r.ok && r.error.code === "wrong_phase")).toBe(true);
  });

  test("rejects all actions when the game is over", () => {
    const state = withTurn(game(), "game_over");
    const id = state.turn.currentPlayerId ?? "";
    const result = applyAction(state, { type: "RollDice", playerId: id });
    expect(result).toMatchObject({ ok: false, error: { code: "wrong_phase" } });
  });

  test("a valid action reaches its handler (stub says not implemented)", () => {
    const state = game();
    const result = applyAction(state, {
      type: "RollDice",
      playerId: state.turn.currentPlayerId ?? "",
    });
    expect(result).toMatchObject({ ok: false, error: { code: "not_implemented" } });
  });

  test("does not change the input state", () => {
    const state = game();
    const snapshot = JSON.parse(JSON.stringify(state)) as GameState;
    applyAction(state, { type: "EndTurn", playerId: "zz" });
    expect(state).toEqual(snapshot);
  });
});

describe("createReducer", () => {
  const handlers: Handlers = {
    ...defaultHandlers,
    RollDice: (state, action) => ({
      ok: true,
      state,
      events: [{ type: "DiceRolled", playerId: action.playerId, dice: [1, 2] }],
    }),
  };
  const reduce = createReducer(handlers);

  test("raises the version by one and passes events through", () => {
    const state = game();
    const id = state.turn.currentPlayerId ?? "";
    const result = reduce(state, { type: "RollDice", playerId: id });
    expect(result).toMatchObject({
      ok: true,
      state: { version: 1 },
      events: [{ type: "DiceRolled", playerId: id, dice: [1, 2] }],
    });
    expect(state.version).toBe(0);
  });

  test("a handler cannot skip validation", () => {
    const result = reduce(game(), { type: "RollDice", playerId: "zz" });
    expect(result).toMatchObject({ ok: false, error: { code: "unknown_player" } });
  });
});
