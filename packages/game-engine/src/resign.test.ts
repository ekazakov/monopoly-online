import { describe, expect, test } from "vite-plus/test";
import { applyAction } from "./index.ts";
import type { Action, GameState } from "./index.ts";
import { base, current, holding, ownerId, player, setCurrent, types } from "./test-helpers.ts";

const ok = (state: GameState, action: Action) => {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(result.error.message);
  return result;
};
const resign = (state: GameState, playerId: string) =>
  applyAction(state, { type: "Resign", playerId });
/** The player after the current one, who is off turn. */
const other = ownerId;

describe("resigning on turn", () => {
  test("with nothing to sell, the player is out and the turn moves on", () => {
    const state = base(1);
    const id = current(state);
    const { state: after, events } = ok(state, { type: "Resign", playerId: id });
    expect(player(after, id)).toMatchObject({ active: false, cash: 0 });
    expect(after.turn.currentPlayerId).not.toBe(id);
    expect(after.turn.phase).toBe("awaiting_roll");
    expect(types(events)).toEqual([
      "PlayerResigned",
      "BankruptcyDeclared",
      "AssetsTransferred",
      "PlayerEliminated",
      "TurnEnded",
    ]);
  });

  test("the bank auctions the deeds, then the turn moves on", () => {
    const state = holding("current", { 1: { houses: 2 }, 3: { houses: 2 } })(base(1));
    const id = current(state);
    const { state: after } = ok(state, { type: "Resign", playerId: id });
    expect(after.auction).toMatchObject({ square: 1, then: "next_in_queue", queue: [3] });
    expect(after.ownership["1"]).toBeUndefined();

    let next = after;
    while (next.auction) next = ok(next, { type: "PassBid", playerId: next.auction.actorId }).state;
    expect(next.turn.currentPlayerId).not.toBe(id);
    expect(next.turn.phase).toBe("awaiting_roll");
  });

  test("with a debt to a player, the creditor gets the assets", () => {
    const state = setCurrent({ cash: 100 })(holding("current", { 6: {} })(base(1)));
    const id = current(state);
    const creditor = other(state);
    const owing: GameState = {
      ...state,
      debts: [
        {
          debtorId: id,
          creditor: { type: "player", id: creditor },
          amount: 500,
          reason: "rent",
          then: "finish_roll",
        },
      ],
      turn: { ...state.turn, phase: "awaiting_debt" },
    };
    const { state: after } = ok(owing, { type: "Resign", playerId: id });
    expect(after.ownership["6"]?.ownerId).toBe(creditor);
    expect(player(after, creditor).cash).toBe(1600);
    expect(after.debts).toEqual([]);
    expect(after.turn.currentPlayerId).not.toBe(id);
  });
});

describe("resigning off turn", () => {
  test("the turn stays with the player on turn, in the same phase", () => {
    const state = base(1);
    const id = other(state);
    const { state: after } = ok(state, { type: "Resign", playerId: id });
    expect(player(after, id).active).toBe(false);
    expect(after.turn).toEqual(state.turn);
  });

  test("after the bank auctions the deeds, the turn continues where it was", () => {
    const state = holding("other", { 5: {}, 15: {} })({
      ...base(1),
      turn: { ...base(1).turn, phase: "awaiting_end_turn" },
    });
    const id = other(state);
    const { state: after } = ok(state, { type: "Resign", playerId: id });
    expect(after.auction).toMatchObject({ square: 5, then: "resume", queue: [15] });

    let next = after;
    while (next.auction) next = ok(next, { type: "PassBid", playerId: next.auction.actorId }).state;
    expect(next.turn).toEqual(state.turn);
    expect(next.ownership).toEqual({});
  });

  test("an open trade is cancelled", () => {
    const state = holding("current", { 6: {} })(base(1));
    const from = current(state);
    const proposed = ok(state, {
      type: "ProposeTrade",
      playerId: from,
      toPlayerId: other(state),
      give: { cash: 0, squares: [6], jailCards: [] },
      get: { cash: 50, squares: [], jailCards: [] },
    }).state;
    const { state: after, events } = ok(proposed, { type: "Resign", playerId: other(state) });
    expect(after.trade).toBeNull();
    expect(after.turn.phase).toBe("awaiting_roll");
    expect(types(events)).toContain("TradeCancelled");
  });
});

describe("limits", () => {
  test("is refused while an auction runs", () => {
    const state = holding("current", { 1: {} })(base(1));
    const selling = ok(state, { type: "Resign", playerId: current(state) }).state;
    const bidder = selling.players.find((p) => p.active)?.id ?? "";
    expect(resign(selling, bidder)).toMatchObject({
      ok: false,
      error: { code: "auction_running" },
    });
  });

  test("an eliminated player cannot resign again", () => {
    const state = base(1);
    const id = other(state);
    const after = ok(state, { type: "Resign", playerId: id }).state;
    expect(resign(after, id)).toMatchObject({ ok: false, error: { code: "player_inactive" } });
  });

  test("with two players left, the other one wins", () => {
    const state = base(1);
    const first = ok(state, { type: "Resign", playerId: other(state) }).state;
    const loser = current(first);
    const { state: after, events } = ok(first, { type: "Resign", playerId: loser });
    expect(after.turn.phase).toBe("game_over");
    expect(after.turn.currentPlayerId).not.toBe(loser);
    expect(types(events).at(-1)).toBe("GameEnded");
  });
});
