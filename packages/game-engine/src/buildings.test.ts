import { describe, expect, test } from "vite-plus/test";
import { applyAction } from "./index.ts";
import type { GameState } from "./index.ts";
import { base, current, holding, player, setCurrent, types } from "./test-helpers.ts";
import type { Setup } from "./test-helpers.ts";

const game = (...setups: Setup[]): GameState => setups.reduce((s, f) => f(s), base(1));
const build = (state: GameState, square: number) =>
  applyAction(state, { type: "Build", playerId: current(state), square });
const sell = (state: GameState, square: number) =>
  applyAction(state, { type: "SellBuilding", playerId: current(state), square });
const code = (result: ReturnType<typeof build>) => (result.ok ? "ok" : result.error.code);
const houses = (result: ReturnType<typeof build>, square: number) =>
  result.ok ? result.state.ownership[String(square)]?.houses : undefined;
const cash = (state: GameState) => player(state, current(state)).cash;

const brown = holding("current", { 1: {}, 3: {} });

describe("Build", () => {
  test("builds a house for the build price", () => {
    const state = game(brown);
    const result = build(state, 1);
    expect(houses(result, 1)).toBe(1);
    expect(result.ok && cash(result.state)).toBe(cash(state) - 50);
    expect(result.ok && types(result.events)).toEqual(["BuildingBuilt"]);
  });

  test("needs the whole colour group", () => {
    expect(code(build(game(holding("current", { 1: {} })), 1))).toBe("incomplete_group");
    expect(code(build(game(holding("current", { 1: {} }), holding("other", { 3: {} })), 1))).toBe(
      "incomplete_group",
    );
  });

  test("needs to own the street, and only streets have buildings", () => {
    expect(code(build(game(holding("other", { 1: {}, 3: {} })), 1))).toBe("not_owner");
    expect(code(build(game(), 1))).toBe("not_owner");
    expect(code(build(game(holding("current", { 5: {} })), 5))).toBe("not_a_street");
    expect(code(build(game(), 0))).toBe("not_a_street");
  });

  test("a mortgaged street in the group blocks building", () => {
    const state = game(holding("current", { 1: { mortgaged: true }, 3: {} }));
    expect(code(build(state, 3))).toBe("group_mortgaged");
  });

  test("builds evenly", () => {
    const state = game(holding("current", { 1: { houses: 1 }, 3: {} }));
    expect(code(build(state, 1))).toBe("uneven_build");
    expect(houses(build(state, 3), 3)).toBe(1);
  });

  test("a hotel needs four houses on every street, and replaces them", () => {
    const state = game(holding("current", { 1: { houses: 4 }, 3: { houses: 4 } }));
    expect(houses(build(state, 1), 1)).toBe(5);
    expect(code(build(game(holding("current", { 1: { houses: 5 }, 3: { houses: 5 } })), 1))).toBe(
      "max_buildings",
    );
  });

  test("needs enough cash", () => {
    expect(code(build(game(brown, setCurrent({ cash: 40 })), 1))).toBe("insufficient_funds");
  });

  test("is allowed before the roll, after the landing, and in Jail, but not in a buy decision", () => {
    const phase =
      (p: GameState["turn"]["phase"]): Setup =>
      (s) => ({
        ...s,
        turn: { ...s.turn, phase: p },
      });
    expect(code(build(game(brown, phase("awaiting_end_turn")), 1))).toBe("ok");
    expect(code(build(game(brown, phase("awaiting_jail_choice")), 1))).toBe("ok");
    expect(code(build(game(brown, phase("awaiting_buy_decision")), 1))).toBe("wrong_phase");
  });

  test("only the player on turn can build", () => {
    const state = game(holding("other", { 1: {}, 3: {} }));
    const other = state.players.find((p) => p.id !== current(state))?.id ?? "";
    const result = applyAction(state, { type: "Build", playerId: other, square: 1 });
    expect(code(result)).toBe("not_your_turn");
  });
});

describe("SellBuilding", () => {
  test("sells a house for half the build price", () => {
    const state = game(holding("current", { 1: { houses: 1 }, 3: {} }));
    const result = sell(state, 1);
    expect(houses(result, 1)).toBe(0);
    expect(result.ok && cash(result.state)).toBe(cash(state) + 25);
    expect(result.ok && types(result.events)).toEqual(["BuildingSold"]);
  });

  test("a hotel sells down to four houses", () => {
    const state = game(holding("current", { 1: { houses: 5 }, 3: { houses: 4 } }));
    expect(houses(sell(state, 1), 1)).toBe(4);
  });

  test("sells evenly, in reverse", () => {
    const state = game(holding("current", { 1: { houses: 2 }, 3: { houses: 1 } }));
    expect(code(sell(state, 3))).toBe("uneven_build");
    expect(houses(sell(state, 1), 1)).toBe(1);
  });

  test("a street without buildings or without an owner cannot sell", () => {
    expect(code(sell(game(brown), 1))).toBe("no_buildings");
    expect(code(sell(game(holding("other", { 1: { houses: 1 } })), 1))).toBe("not_owner");
  });

  test("selling then building again restores the street", () => {
    const state = game(holding("current", { 1: { houses: 2 }, 3: { houses: 2 } }));
    const sold = sell(state, 1);
    const rebuilt = sold.ok ? build(sold.state, 1) : sold;
    expect(houses(rebuilt, 1)).toBe(2);
    expect(rebuilt.ok && cash(rebuilt.state)).toBe(cash(state) - 25);
  });
});
