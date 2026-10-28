import { describe, expect, test } from "vite-plus/test";
import { applyAction, unmortgageCost } from "./index.ts";
import type { GameState } from "./index.ts";
import { base, current, holding, player, setCurrent, types } from "./test-helpers.ts";
import type { Setup } from "./test-helpers.ts";

const game = (...setups: Setup[]): GameState => setups.reduce((s, f) => f(s), base(1));
const mortgage = (state: GameState, square: number) =>
  applyAction(state, { type: "Mortgage", playerId: current(state), square });
const lift = (state: GameState, square: number) =>
  applyAction(state, { type: "Unmortgage", playerId: current(state), square });
const code = (result: ReturnType<typeof mortgage>) => (result.ok ? "ok" : result.error.code);
const cash = (state: GameState) => player(state, current(state)).cash;
const mortgaged = (result: ReturnType<typeof mortgage>, square: number) =>
  result.ok ? result.state.ownership[String(square)]?.mortgaged : undefined;

describe("Mortgage", () => {
  test("pays half the price and marks the deed", () => {
    const state = game(holding("current", { 1: {} }));
    const result = mortgage(state, 1);
    expect(mortgaged(result, 1)).toBe(true);
    expect(result.ok && cash(result.state)).toBe(cash(state) + 30);
    expect(result.ok && types(result.events)).toEqual(["PropertyMortgaged"]);
  });

  test("works for stations and utilities", () => {
    const state = game(holding("current", { 5: {}, 12: {} }));
    expect(mortgage(state, 5).ok && cash((mortgage(state, 5) as { state: GameState }).state)).toBe(
      cash(state) + 100,
    );
    expect(mortgaged(mortgage(state, 12), 12)).toBe(true);
  });

  test("is rejected while any street in the group has buildings", () => {
    const state = game(holding("current", { 1: { houses: 1 }, 3: {} }));
    expect(code(mortgage(state, 3))).toBe("has_buildings");
  });

  test("is rejected twice, for a stranger's deed, and for non-properties", () => {
    expect(code(mortgage(game(holding("current", { 1: { mortgaged: true } })), 1))).toBe(
      "already_mortgaged",
    );
    expect(code(mortgage(game(holding("other", { 1: {} })), 1))).toBe("not_owner");
    expect(code(mortgage(game(), 1))).toBe("not_owner");
    expect(code(mortgage(game(), 2))).toBe("not_a_property");
  });
});

describe("Unmortgage", () => {
  test("costs the mortgage value plus 10%, rounded up to whole dollars", () => {
    const table: [number, number][] = [
      [30, 33],
      [50, 55],
      [60, 66],
      [75, 83],
      [90, 99],
      [100, 110],
      [110, 121],
      [175, 193],
      [200, 220],
    ];
    expect(table.map(([value]) => unmortgageCost(value))).toEqual(table.map(([, cost]) => cost));
    const state = game(holding("current", { 1: { mortgaged: true } }));
    const result = lift(state, 1);
    expect(mortgaged(result, 1)).toBe(false);
    expect(result.ok && cash(result.state)).toBe(cash(state) - 33);
    expect(result.ok && types(result.events)).toEqual(["PropertyUnmortgaged"]);
  });

  test("lifting a station's mortgage costs $110", () => {
    const state = game(holding("current", { 5: { mortgaged: true } }));
    const result = lift(state, 5);
    expect(mortgaged(result, 5)).toBe(false);
    expect(result.ok && cash(result.state)).toBe(cash(state) - 110);
  });

  test("is rejected for a deed that is not mortgaged, without cash, or for a stranger", () => {
    expect(code(lift(game(holding("current", { 1: {} })), 1))).toBe("not_mortgaged");
    expect(
      code(lift(game(holding("current", { 1: { mortgaged: true } }), setCurrent({ cash: 20 })), 1)),
    ).toBe("insufficient_funds");
    expect(code(lift(game(holding("other", { 1: { mortgaged: true } })), 1))).toBe("not_owner");
  });

  test("a group can be built on again after the mortgage is lifted", () => {
    const state = game(holding("current", { 1: { mortgaged: true }, 3: {} }));
    const blocked = applyAction(state, { type: "Build", playerId: current(state), square: 3 });
    expect(code(blocked)).toBe("group_mortgaged");
    const lifted = lift(state, 1);
    const built = lifted.ok
      ? applyAction(lifted.state, { type: "Build", playerId: current(lifted.state), square: 3 })
      : lifted;
    expect(code(built)).toBe("ok");
  });
});
