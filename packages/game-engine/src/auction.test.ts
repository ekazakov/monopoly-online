import { describe, expect, test } from "vite-plus/test";
import { actorFor, applyAction } from "./index.ts";
import type { Action, GameState } from "./index.ts";
import { current, gameWhere, landing, player, roll, setCurrent, types } from "./test-helpers.ts";
import type { Setup } from "./test-helpers.ts";

const ok = (state: GameState, action: Action) => {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(result.error.message);
  return result;
};
const code = (state: GameState, action: Action) => {
  const result = applyAction(state, action);
  return result.ok ? "ok" : result.error.code;
};
const cash = (state: GameState, id: string) => player(state, id).cash;
const bid = (state: GameState, amount: number) =>
  ok(state, { type: "Bid", playerId: actorFor(state), amount });
const pass = (state: GameState) => ok(state, { type: "PassBid", playerId: actorFor(state) });

// The current player lands on Kelp Court ($60) and declines, so it goes to auction.
const auction = (...extra: Setup[]) => {
  const landed = roll(landing(0, 3, ...extra)).state;
  return ok(landed, { type: "DeclineProperty", playerId: current(landed) });
};

describe("starting an auction", () => {
  test("every active player bids, in seat order, starting with the player on turn", () => {
    const { state, events } = auction();
    const lander = current(state);
    const index = state.players.findIndex((p) => p.id === lander);
    const expected = [0, 1, 2].map((step) => state.players[(index + step) % 3]?.id);
    expect(state.auction).toMatchObject({
      square: 3,
      bidderOrder: expected,
      passed: [],
      highBid: 0,
      highBidderId: null,
      actorId: lander,
    });
    expect(state.turn.phase).toBe("awaiting_bid");
    expect(types(events)).toEqual(["AuctionStarted"]);
  });

  test("only the bidder whose turn it is can act, and only in an auction", () => {
    const { state } = auction();
    const other = state.players.find((p) => p.id !== actorFor(state))?.id ?? "";
    expect(code(state, { type: "Bid", playerId: other, amount: 10 })).toBe("not_your_turn");
    expect(code(state, { type: "RollDice", playerId: actorFor(state) })).toBe("wrong_phase");
    const idle = landing(0, 3);
    expect(code(idle, { type: "Bid", playerId: current(idle), amount: 10 })).toBe("wrong_phase");
  });

  test("a player who cannot afford the opening bid passes at once", () => {
    const poor: Setup = (s) => ({
      ...s,
      players: s.players.map((p, i) => (i === 1 ? { ...p, cash: 5 } : p)),
    });
    const { state, events } = auction(poor);
    const skipped = state.players[1]?.id ?? "";
    expect(state.auction?.passed).toContain(skipped);
    expect(types(events)).toContain("BidPassed");
  });

  test("a player who cannot afford the property starts straight in the auction", () => {
    const state = roll(landing(0, 3, setCurrent({ cash: 50 }))).state;
    expect(state.turn.phase).toBe("awaiting_bid");
    expect(bid(state, 50).state.auction?.highBid).toBe(50);
  });
});

describe("bidding", () => {
  test("the opening bid is at least $10 and at most the bidder's cash", () => {
    const { state } = auction();
    const id = actorFor(state);
    expect(code(state, { type: "Bid", playerId: id, amount: 5 })).toBe("invalid_bid");
    expect(code(state, { type: "Bid", playerId: id, amount: 9999 })).toBe("invalid_bid");
    expect(code(state, { type: "Bid", playerId: id, amount: 10.5 })).toBe("invalid_bid");
    expect(code(state, { type: "Bid", playerId: id, amount: 10 })).toBe("ok");
  });

  test("a raise is +$10, +$50 or +$100 over the best bid", () => {
    const first = bid(auction().state, 20).state;
    const id = actorFor(first);
    for (const amount of [20, 25, 31, 119]) {
      expect(code(first, { type: "Bid", playerId: id, amount })).toBe("invalid_bid");
    }
    for (const amount of [30, 70, 120]) {
      expect(code(first, { type: "Bid", playerId: id, amount })).toBe("ok");
    }
  });

  test("after a bid the next bidder acts, and the best bidder waits", () => {
    const { state } = auction();
    const lander = actorFor(state);
    const afterBid = bid(state, 10).state;
    expect(afterBid.auction).toMatchObject({ highBid: 10, highBidderId: lander });
    expect(actorFor(afterBid)).not.toBe(lander);
  });

  test("a pass is final", () => {
    const { state } = auction();
    const lander = actorFor(state);
    const afterBid = bid(state, 10).state; // lander bids
    const second = actorFor(afterBid);
    const afterPass = pass(afterBid).state; // second passes
    const third = actorFor(afterPass);
    const raised = bid(afterPass, 20).state; // third bids
    expect(raised.auction?.passed).toEqual([second]);
    expect(actorFor(raised)).toBe(lander); // not the bidder who passed
    expect(third).not.toBe(second);
  });
});

describe("ending an auction", () => {
  test("the winner pays the bank and gets the deed, and the turn goes on", () => {
    const { state } = auction();
    const turnPlayer = current(state);
    const a = actorFor(state);
    const s1 = bid(state, 10).state; // a bids 10
    const b = actorFor(s1);
    const s2 = bid(s1, 60).state; // b bids 60
    const s3 = pass(s2).state; // third passes
    expect(actorFor(s3)).toBe(a);
    const done = pass(s3); // a passes, so b wins
    expect(done.state.auction).toBeNull();
    expect(done.state.ownership["3"]).toEqual({ ownerId: b, houses: 0, mortgaged: false });
    expect(cash(done.state, b)).toBe(cash(state, b) - 60);
    expect(done.state.turn).toMatchObject({
      currentPlayerId: turnPlayer,
      phase: "awaiting_end_turn",
    });
    expect(types(done.events)).toEqual(["BidPassed", "AuctionEnded"]);
    expect(done.events.at(-1)).toEqual({ type: "AuctionEnded", square: 3, winnerId: b, price: 60 });
  });

  test("with no bids the property stays unowned", () => {
    let { state } = auction();
    state = pass(state).state;
    state = pass(state).state;
    const done = pass(state);
    expect(done.state.ownership).toEqual({});
    expect(done.state.auction).toBeNull();
    expect(done.events.at(-1)).toEqual({
      type: "AuctionEnded",
      square: 3,
      winnerId: null,
      price: 0,
    });
    expect(done.state.turn.phase).toBe("awaiting_end_turn");
  });

  test("the last bidder left can still bid when nobody has", () => {
    let { state } = auction();
    const second = state.auction?.bidderOrder[1] ?? "";
    const third = state.auction?.bidderOrder[2] ?? "";
    state = pass(state).state; // lander passes
    state = pass(state).state; // second passes
    expect(actorFor(state)).toBe(third);
    const won = bid(state, 10);
    expect(won.state.ownership["3"]?.ownerId).toBe(third);
    expect(second).not.toBe(third);
  });

  test("a bidder who cannot afford the next bid passes at once", () => {
    const { state: started } = auction();
    const [a, b, c] = started.auction?.bidderOrder ?? [];
    const state: GameState = {
      ...started,
      players: started.players.map((p) => (p.id === c ? { ...p, cash: 65 } : p)),
    };
    const s1 = bid(state, 10).state; // a bids 10
    const s2 = bid(s1, 60); // b bids 60; c has $65, below the next minimum of $70
    expect(s2.events).toContainEqual({ type: "BidPassed", playerId: c, auto: true });
    expect(s2.state.auction?.passed).toEqual([c]);
    expect(actorFor(s2.state)).toBe(a);
    const done = pass(s2.state).state; // a passes, so b wins
    expect(done.ownership["3"]?.ownerId).toBe(b);
  });

  test("after a double the player rolls again when the auction ends", () => {
    const state = gameWhere((d) => d[0] === 3 && d[1] === 3, setCurrent({ position: 0 }));
    let next = ok(roll(state).state, { type: "DeclineProperty", playerId: current(state) }).state;
    expect(next.turn.phase).toBe("awaiting_bid");
    next = pass(pass(pass(next).state).state).state;
    expect(next.turn).toMatchObject({
      currentPlayerId: current(state),
      phase: "awaiting_roll",
      doubles: 1,
    });
  });
});
