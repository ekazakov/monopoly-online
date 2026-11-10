import { actorFor, applyAction, createGame, mayAct as engineMayAct } from "@monopoly/game-engine";
import type { Action, ActionType } from "@monopoly/game-engine";
import { describe, expect, test } from "vite-plus/test";
import { recordFixture, redact, roomOf, withStatus } from "./fixtures.ts";
import {
  actingSeat,
  currentPlayer,
  isFinished,
  isMyTurn,
  mayAct,
  mayActWith,
  mySeats,
  phase,
  seatThatMayAct,
  winner,
} from "./selectors.ts";

const fx = recordFixture(60);
const { game, seats, ownerId, guestId } = fx;
const ids = (list: readonly { id: string }[]) => list.map((s) => s.id);

const ACTION_TYPES: ActionType[] = [
  "RollDice",
  "BuyProperty",
  "Bid",
  "AcceptTrade",
  "CancelTrade",
  "Resign",
];

describe("mySeats", () => {
  test("own user seat and the hot-seat seats of the user", () => {
    expect(ids(mySeats(game, ownerId))).toEqual([seats.a.id, seats.c.id]);
    expect(ids(mySeats(game, guestId))).toEqual([seats.b.id]);
  });

  test("nothing without a game, a user or a match", () => {
    expect(mySeats(null, ownerId)).toEqual([]);
    expect(mySeats(game, null)).toEqual([]);
    expect(mySeats(game, crypto.randomUUID())).toEqual([]);
  });
});

describe("phase, currentPlayer and actingSeat", () => {
  const first = fx.steps[0];
  if (!first) throw new Error("no step");

  test("read the redacted state", () => {
    expect(phase(first.state)).toBe(first.state.turn.phase);
    expect(currentPlayer(first.state)?.id).toBe(first.state.turn.currentPlayerId);
    expect(phase(null)).toBeNull();
    expect(currentPlayer(null)).toBeNull();
    expect(actingSeat(game, null)).toBeNull();
    expect(actingSeat(null, first.state)).toBeNull();
  });

  test("agree with the engine actorFor on every recorded state", () => {
    const phases = new Set<string>();
    for (const step of [{ full: fx.start, state: redact(fx.start) }, ...fx.steps]) {
      phases.add(step.state.turn.phase);
      expect(actingSeat(game, step.state)?.id).toBe(actorFor(step.full));
      for (const seat of game.seats) {
        for (const type of ACTION_TYPES) {
          const wanted =
            step.state.players.find((p) => p.id === seat.id)?.active === true &&
            engineMayAct(step.full, type, seat.id);
          expect(mayActWith(game, step.state, seat.id, type)).toBe(wanted);
        }
        expect(mayActWith(game, step.state, seat.id)).toBe(actorFor(step.full) === seat.id);
      }
    }
    // The recorded game must reach the bidder, who is not the player on turn.
    expect(phases).toContain("awaiting_bid");
    expect(phases).toContain("awaiting_buy_decision");
  });

  test("the bidder acts in an auction, not the player on turn", () => {
    const step = fx.steps.find((s) => s.full.turn.phase === "awaiting_bid" && s.full.auction);
    if (!step?.full.auction) throw new Error("no auction");
    expect(actingSeat(game, step.state)?.id).toBe(step.full.auction.actorId);
    expect(mayActWith(game, step.state, step.full.auction.actorId)).toBe(true);
  });
});

describe("mayAct", () => {
  const state = redact(fx.start);
  const actingId = actorFor(fx.start);
  const acting = game.seats.find((s) => s.id === actingId);
  if (!acting) throw new Error("no acting seat");
  const owner = acting.controllerUserId;
  const other = owner === ownerId ? guestId : ownerId;

  test("only the controller of the acting seat may act", () => {
    expect(mayAct(game, state, owner)).toBe(true);
    expect(isMyTurn(game, state, owner)).toBe(true);
    expect(seatThatMayAct(game, state, owner)?.id).toBe(actingId);
    expect(mayAct(game, state, other, "RollDice")).toBe(false);
    expect(isMyTurn(game, state, other)).toBe(false);
    expect(seatThatMayAct(game, state, other)).toBeNull();
  });

  test("is false without a game, a state or a user", () => {
    expect(mayAct(null, state, owner)).toBe(false);
    expect(mayAct(game, null, owner)).toBe(false);
    expect(mayAct(game, state, null)).toBe(false);
    expect(isMyTurn(game, state, null)).toBe(false);
    expect(mayActWith(game, state, crypto.randomUUID())).toBe(false);
  });

  test("any active seat may resign, also off turn", () => {
    const offTurn = game.seats.find((s) => s.id !== actingId);
    if (!offTurn) throw new Error("no seat");
    expect(mayActWith(game, state, offTurn.id)).toBe(false);
    expect(mayActWith(game, state, offTurn.id, "Resign")).toBe(true);
    expect(mayAct(game, state, offTurn.controllerUserId, "Resign")).toBe(true);
  });

  test("only the proposer may cancel a trade and only the partner may answer it", () => {
    const [from, to] = [actingId, game.seats.find((s) => s.id !== actingId)?.id ?? ""];
    const proposal: Action = {
      type: "ProposeTrade",
      playerId: from,
      toPlayerId: to,
      give: { cash: 10, squares: [], jailCards: [] },
      get: { cash: 0, squares: [], jailCards: [] },
    };
    const result = applyAction(fx.start, proposal);
    if (!result.ok) throw new Error(result.error.message);
    const open = redact(result.state);
    expect(phase(open)).toBe("awaiting_trade_response");
    expect(actingSeat(game, open)?.id).toBe(to);
    expect(mayActWith(game, open, to, "AcceptTrade")).toBe(true);
    expect(mayActWith(game, open, from, "AcceptTrade")).toBe(false);
    expect(mayActWith(game, open, from, "CancelTrade")).toBe(true);
    expect(mayActWith(game, open, to, "CancelTrade")).toBe(false);
  });

  test("an eliminated seat may not act", () => {
    const gone = {
      ...state,
      players: state.players.map((p) => (p.id === actingId ? { ...p, active: false } : p)),
    };
    expect(mayActWith(game, gone, actingId)).toBe(false);
    expect(mayActWith(game, gone, actingId, "Resign")).toBe(false);
  });
});

describe("isFinished and winner", () => {
  const running = redact(fx.start);
  const over = (() => {
    const room = roomOf();
    const start = createGame({
      seed: 3,
      players: [room.seats.a, room.seats.b].map((s) => ({ id: s.id, name: s.name })),
    });
    const result = applyAction(start, { type: "Resign", playerId: start.turn.currentPlayerId });
    if (!result.ok) throw new Error(result.error.message);
    return { room, state: redact(result.state), resigned: start.turn.currentPlayerId };
  })();

  test("a running game has no winner", () => {
    expect(isFinished(game, running)).toBe(false);
    expect(isFinished(null, null)).toBe(false);
    expect(winner(running)).toBeNull();
    expect(winner(null)).toBeNull();
  });

  test("the last active player wins", () => {
    expect(phase(over.state)).toBe("game_over");
    expect(isFinished(over.room.game, over.state)).toBe(true);
    expect(winner(over.state)?.id).not.toBe(over.resigned);
    expect(winner(over.state)?.active).toBe(true);
    expect(actingSeat(over.room.game, over.state)).toBeNull();
    expect(mayAct(over.room.game, over.state, over.room.ownerId, "Resign")).toBe(false);
  });

  test("a finished room is finished with no winner when the owner ended it", () => {
    expect(isFinished(withStatus(game, "finished"), running)).toBe(true);
    expect(winner(running)).toBeNull();
  });
});
