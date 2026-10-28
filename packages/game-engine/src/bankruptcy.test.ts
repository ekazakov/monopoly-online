import { describe, expect, test } from "vite-plus/test";
import type { GameState } from "./index.ts";
import {
  addPlayer,
  current,
  holding,
  landing,
  ownerId,
  player,
  roll,
  setCurrent,
  topCard,
  types,
} from "./test-helpers.ts";
import type { Setup } from "./test-helpers.ts";

const cash = (state: GameState, id: string) => player(state, id).cash;
const total = (state: GameState) => state.players.reduce((sum, p) => sum + p.cash, 0);

// Landing on Kelp Court (3) with a hotel costs $450. The debtor can raise only $70.
const broke = (...extra: Setup[]) =>
  landing(
    0,
    3,
    holding("other", { 1: { houses: 4 }, 3: { houses: 5 } }),
    setCurrent({ cash: 20 }),
    holding("current", { 6: {} }),
    ...extra,
  );

describe("bankruptcy to a player", () => {
  test("transfers cash and deeds to the creditor, eliminates the debtor and moves the turn", () => {
    const state = broke();
    const id = current(state);
    const owner = ownerId(state);
    const { state: after, events } = roll(state);
    expect(player(after, id)).toMatchObject({ active: false, cash: 0 });
    expect(cash(after, owner)).toBe(cash(state, owner) + 20);
    expect(after.ownership["6"]).toEqual({ ownerId: owner, houses: 0, mortgaged: false });
    expect(after.debts).toEqual([]);
    expect(after.turn.currentPlayerId).not.toBe(id);
    expect(after.turn.phase).toBe("awaiting_roll");
    expect(types(events)).toEqual([
      "DiceRolled",
      "PlayerMoved",
      "BankruptcyDeclared",
      "AssetsTransferred",
      "PlayerEliminated",
      "TurnEnded",
    ]);
  });

  test("buildings are sold to the bank at half price and the money goes to the creditor", () => {
    const state = landing(
      30,
      9,
      holding("other", { 37: { houses: 5 }, 39: { houses: 5 } }),
      setCurrent({ cash: 100 }),
      holding("current", { 1: { houses: 2 }, 3: { houses: 2 } }),
    );
    const owner = ownerId(state);
    const { state: after } = roll(state);
    expect(cash(after, owner)).toBe(cash(state, owner) + 100 + 4 * 25);
    expect(after.ownership["1"]).toEqual({ ownerId: owner, houses: 0, mortgaged: false });
    expect(after.ownership["3"]?.houses).toBe(0);
  });

  test("mortgaged deeds stay mortgaged", () => {
    const state = landing(
      0,
      3,
      holding("other", { 1: { houses: 4 }, 3: { houses: 5 } }),
      setCurrent({ cash: 20 }),
      holding("current", { 6: { mortgaged: true }, 8: {}, 9: {} }),
    );
    const { state: after } = roll(state);
    expect(after.ownership["6"]?.mortgaged).toBe(true);
    expect(after.ownership["8"]?.mortgaged).toBe(false);
  });

  test("jail cards go to the creditor", () => {
    const state = broke(setCurrent({ heldJailCards: ["chance", "chest"] }));
    const { state: after } = roll(state);
    expect(player(after, ownerId(state)).heldJailCards).toEqual(["chance", "chest"]);
    expect(player(after, current(state)).heldJailCards).toEqual([]);
  });

  test("several creditors split the cash pro rata and the biggest gets the deeds", () => {
    // Harbour master's party: $50 to each of the three other players. The debtor has $31 and one deed.
    const state = landing(
      0,
      7,
      topCard("chance", 13),
      addPlayer("d"),
      setCurrent({ cash: 31 }),
      holding("current", { 6: {} }),
    );
    const id = current(state);
    const order = state.players.map((p) => p.id);
    const after = roll(state).state;
    const index = order.indexOf(id);
    const firstAfter = order[(index + 1) % order.length] ?? "";
    // Shares are 10, 10, 10 with a remainder of 1 for the first creditor in turn order.
    const gains = state.players
      .filter((p) => p.id !== id)
      .map((p) => cash(after, p.id) - cash(state, p.id));
    expect(gains.sort((a, b) => a - b)).toEqual([10, 10, 11]);
    expect(cash(after, firstAfter) - cash(state, firstAfter)).toBe(11);
    expect(after.ownership["6"]?.ownerId).toBe(firstAfter);
    expect(total(after)).toBe(total(state));
  });

  test("equal creditors: the deeds go to the first one after the debtor", () => {
    // The debtor owes $50 to each other player. All amounts are equal, so the tie rule decides.
    const state = landing(
      0,
      7,
      topCard("chance", 13),
      setCurrent({ cash: 5 }),
      holding("current", { 6: {} }),
    );
    const id = current(state);
    const order = state.players.map((p) => p.id);
    const firstAfter = order[(order.indexOf(id) + 1) % order.length] ?? "";
    expect(roll(state).state.ownership["6"]?.ownerId).toBe(firstAfter);
  });

  test("the game ends when one active player is left", () => {
    const onlyTwo: Setup = (s) => ({
      ...s,
      players: s.players.map((p) =>
        p.id !== current(s) && p.id !== ownerId(s) ? { ...p, active: false } : p,
      ),
    });
    const state = broke(onlyTwo);
    const owner = ownerId(state);
    const { state: after, events } = roll(state);
    expect(after.turn.phase).toBe("game_over");
    expect(after.turn.currentPlayerId).toBe(owner);
    expect(events.at(-1)).toEqual({ type: "GameEnded", winnerId: owner });
  });
});
