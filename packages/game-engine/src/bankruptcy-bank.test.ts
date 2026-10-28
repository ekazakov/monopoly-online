import { describe, expect, test } from "vite-plus/test";
import { actorFor, applyAction } from "./index.ts";
import type { Action, GameState } from "./index.ts";
import { current, holding, landing, player, roll, setCurrent, types } from "./test-helpers.ts";
import type { Setup } from "./test-helpers.ts";

const ok = (state: GameState, action: Action) => {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(result.error.message);
  return result;
};
const pass = (state: GameState) => ok(state, { type: "PassBid", playerId: actorFor(state) }).state;

// Income Tax takes $200. The debtor has $100 and the brown streets (worth $85 in all), so can raise $185.
const broke = (...extra: Setup[]) =>
  landing(
    0,
    4,
    setCurrent({ cash: 100 }),
    holding("current", { 1: { houses: 1 }, 3: {} }),
    ...extra,
  );

describe("bankruptcy to the bank", () => {
  test("removes buildings, frees the deeds, eliminates the debtor, and sells the deeds", () => {
    const state = broke();
    const debtor = current(state);
    const { state: after, events } = roll(state);
    expect(player(after, debtor)).toMatchObject({ active: false, cash: 0 });
    // Square 1 is for sale first, in board order. Square 3 waits in the queue.
    expect(after.turn).toMatchObject({ currentPlayerId: debtor, phase: "awaiting_bid" });
    expect(after.auction).toMatchObject({ square: 1, then: "next_in_queue", queue: [3] });
    expect(after.ownership).toEqual({});
    expect(types(events)).toEqual([
      "DiceRolled",
      "PlayerMoved",
      "BankruptcyDeclared",
      "AssetsTransferred",
      "PlayerEliminated",
      "AuctionStarted",
    ]);
  });

  test("bidding starts with the first active player after the debtor", () => {
    const state = broke();
    const debtor = current(state);
    const index = state.players.findIndex((p) => p.id === debtor);
    const { state: after } = roll(state);
    const firstAfter = state.players[(index + 1) % 3]?.id;
    expect(after.auction?.bidderOrder[0]).toBe(firstAfter);
    expect(after.auction?.bidderOrder).not.toContain(debtor);
    expect(actorFor(after)).toBe(firstAfter);
  });

  test("the deeds are sold one at a time, then the turn moves on", () => {
    const debtor = current(broke());
    let state = roll(broke()).state;
    const winner = actorFor(state);
    state = ok(state, { type: "Bid", playerId: winner, amount: 10 }).state;
    state = pass(state); // the other bidder passes: the winner gets square 1 at $10
    expect(state.ownership["1"]).toEqual({ ownerId: winner, houses: 0, mortgaged: false });
    expect(state.auction).toMatchObject({ square: 3, queue: [] });
    state = pass(pass(state)); // nobody bids for square 3
    expect(state.ownership["3"]).toBeUndefined();
    expect(state.auction).toBeNull();
    expect(state.turn.currentPlayerId).not.toBe(debtor);
    expect(state.turn.phase).toBe("awaiting_roll");
  });

  test("a mortgaged deed is sold without its mortgage", () => {
    const state = landing(
      0,
      4,
      setCurrent({ cash: 50 }),
      holding("current", { 6: { mortgaged: true }, 8: {}, 9: {} }),
    );
    let next = roll(state).state;
    const winner = actorFor(next);
    next = ok(next, { type: "Bid", playerId: winner, amount: 10 }).state;
    next = pass(next);
    expect(next.ownership["6"]).toEqual({ ownerId: winner, houses: 0, mortgaged: false });
  });

  test("jail cards return to the bottom of their decks", () => {
    const holdsCards: Setup = (s) => ({
      ...setCurrent({ heldJailCards: ["chance", "chest"] })(s),
      decks: {
        chance: s.decks.chance.filter((i) => i !== 15),
        chest: s.decks.chest.filter((i) => i !== 15),
      },
    });
    const state = broke(holdsCards);
    const { state: after } = roll(state);
    expect(after.decks.chance).toHaveLength(16);
    expect(after.decks.chest).toHaveLength(16);
    expect(after.decks.chance.at(-1)).toBe(15);
    expect(after.decks.chest.at(-1)).toBe(15);
  });

  test("no auction when fewer than two players are left, and the game ends", () => {
    const onlyTwo: Setup = (s) => {
      const keep = s.players.find((p) => p.id !== current(s))?.id;
      return {
        ...s,
        players: s.players.map((p) =>
          p.id !== current(s) && p.id !== keep ? { ...p, active: false } : p,
        ),
      };
    };
    const state = broke(onlyTwo);
    const { state: after, events } = roll(state);
    expect(after.auction).toBeNull();
    expect(after.turn.phase).toBe("game_over");
    expect(after.turn.currentPlayerId).not.toBe(current(state));
    expect(events.at(-1)).toMatchObject({ type: "GameEnded" });
    expect(after.ownership).toEqual({});
  });

  test("a bankrupt player with no deeds just ends the turn", () => {
    const state = landing(0, 4, setCurrent({ cash: 100 }));
    const { state: after } = roll(state);
    expect(after.auction).toBeNull();
    expect(after.turn.phase).toBe("awaiting_roll");
    expect(after.turn.currentPlayerId).not.toBe(current(state));
  });
});
