import { applyAction } from "@monopoly/game-engine";
import type { GameState } from "@monopoly/game-engine";
import { describe, expect, test } from "vite-plus/test";
import { redact } from "../../../../game/fixtures.ts";
import { canProposeTrade, checkTrade, emptySide, parseCash, proposingSeat } from "./tradeModel.ts";
import type { SideDraft } from "./tradeModel.ts";
import { a, b, c, fx } from "./tradeFixtures.tsx";

describe("parseCash", () => {
  test.each([
    ["", 0],
    [" 12 ", 12],
    ["0", 0],
    ["1500", 1500],
    ["-1", null],
    ["1.5", null],
    ["1e3", null],
    ["abc", null],
    ["99999999999999999999", null],
  ] as const)("%j is %j", (text, expected) => {
    expect(parseCash(text)).toBe(expected);
  });
});

// The drift test: the client check and the engine agree on a set of trades, so a rule that
// changes in the engine breaks this test.
describe("checkTrade against the engine", () => {
  const ownerOf = (ownerId: string, houses = 0, mortgaged = false) => ({
    ownerId,
    houses,
    mortgaged,
  });
  const full: GameState = {
    ...fx.start,
    turn: { ...fx.start.turn, currentPlayerId: a.id, phase: "awaiting_roll" },
    ownership: {
      "1": ownerOf(a.id),
      "3": ownerOf(a.id, 2),
      "5": ownerOf(a.id, 0, true),
      "6": ownerOf(b.id),
    },
    players: fx.start.players.map((p) => ({
      ...p,
      cash: p.id === a.id ? 100 : 300,
      heldJailCards: p.id === b.id ? ["chest"] : [],
    })),
  };
  const state = redact(full);
  const player = (id: string) => state.players.find((p) => p.id === id)!;
  const side = (over: Partial<SideDraft>): SideDraft => ({ ...emptySide, ...over });

  const cases: [string, string, SideDraft, SideDraft][] = [
    ["a gift", b.id, side({ cash: "100" }), emptySide],
    ["more cash than owned", b.id, side({ cash: "101" }), emptySide],
    ["a swap with a mortgaged deed", b.id, side({ squares: [5] }), side({ squares: [6] })],
    ["a deed of a built group", b.id, side({ squares: [1] }), emptySide],
    ["a jail card", b.id, emptySide, side({ jailCards: [0] })],
    ["a deed of the partner side", c.id, emptySide, side({ squares: [6] })],
    ["an empty trade", b.id, emptySide, emptySide],
  ];

  test.each(cases)("%s", (_name, partnerId, give, get) => {
    const check = checkTrade(state, player(a.id), player(partnerId), give, get);
    const sent =
      check.give && check.get
        ? applyAction(full, {
            type: "ProposeTrade",
            playerId: a.id,
            toPlayerId: partnerId,
            give: check.give,
            get: check.get,
          }).ok
        : false;
    // The button is enabled exactly when the engine accepts the trade the button would send.
    expect(check.blocker === null).toBe(sent);
  });

  test("a drop of a locked deed leaves the rest of the offer valid", () => {
    const check = checkTrade(
      state,
      player(a.id),
      player(b.id),
      side({ squares: [1, 5] }),
      emptySide,
    );
    expect(check.give?.squares).toEqual([5]);
    expect(check.blocker).toBeNull();
  });
});

describe("proposingSeat and canProposeTrade", () => {
  const state = redact({
    ...fx.start,
    turn: { ...fx.start.turn, currentPlayerId: a.id, phase: "awaiting_roll" },
  });

  test("is the seat on turn of this device in a phase that allows a proposal", () => {
    expect(proposingSeat(fx.game, state, fx.ownerId)?.id).toBe(a.id);
    expect(proposingSeat(fx.game, state, fx.guestId)).toBeNull();
  });

  test.each(["awaiting_buy_decision", "awaiting_bid", "awaiting_trade_response"] as const)(
    "is null in %s",
    (phase) => {
      const next = { ...state, turn: { ...state.turn, phase } };
      expect(proposingSeat(fx.game, next, fx.ownerId)).toBeNull();
    },
  );

  test("is null when no other player is active", () => {
    const next = {
      ...state,
      players: state.players.map((p) => (p.id === a.id ? p : { ...p, active: false })),
    };
    expect(proposingSeat(fx.game, next, fx.ownerId)).toBeNull();
  });

  test("canProposeTrade is false while an action is pending", () => {
    const turn = {
      userId: fx.ownerId,
      view: { game: fx.game, state },
      pending: true,
    } as unknown as Parameters<typeof canProposeTrade>[0];
    expect(canProposeTrade(turn)).toBe(false);
    expect(canProposeTrade({ ...turn, pending: false })).toBe(true);
  });
});
