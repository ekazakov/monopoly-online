import type { GameEvent } from "@monopoly/shared";
import { describe, expect, test } from "vite-plus/test";
import { roundsOf } from "./rounds.ts";

const other: GameEvent = { type: "PassedGo", playerId: "p1", amount: 200 };
const turnEnd: GameEvent = { type: "TurnEnded", playerId: "p1", nextPlayerId: "p2" };
const resigned: GameEvent = { type: "PlayerResigned", playerId: "p2" };

const wrap = (events: GameEvent[]) => events.map((event) => ({ event }));

describe("roundsOf", () => {
  test("the events before the first TurnEnded are round 0", () => {
    expect(roundsOf(wrap([other, other]), 0, 3)).toEqual([0, 0]);
  });

  test("round 1 starts after as many TurnEnded events as there are seats", () => {
    const events = wrap([other, turnEnd, turnEnd, other, turnEnd, other]);
    // With 3 seats, round 1 starts at the last event: 3 TurnEnded events came before it.
    expect(roundsOf(events, 0, 3)).toEqual([0, 0, 0, 0, 0, 1]);
    // With 2 seats, round 1 starts after the second TurnEnded.
    expect(roundsOf(events, 0, 2)).toEqual([0, 0, 0, 1, 1, 1]);
  });

  test("the event right after the Nth TurnEnded is in the next round", () => {
    // 2 seats: the first TurnEnded keeps round 0, the second one ends it, the next event is round 1.
    expect(roundsOf(wrap([turnEnd, turnEnd, other]), 0, 2)).toEqual([0, 0, 1]);
  });

  test("dropped TurnEnded events offset the round numbers", () => {
    // 4 TurnEnded events were cut from a 3-seat game: one full round is gone, so round 1 is current.
    expect(roundsOf(wrap([other, turnEnd, other]), 4, 3)).toEqual([1, 1, 1]);
    // 3 dropped events with 3 seats: the first kept event starts round 1.
    expect(roundsOf(wrap([other]), 3, 3)).toEqual([1]);
    // 2 dropped events with 3 seats: still round 0.
    expect(roundsOf(wrap([other]), 2, 3)).toEqual([0]);
  });

  test("a resigned seat does not change the divisor", () => {
    // The seat count is the 2 players at start. The resignation is not a TurnEnded event.
    const events = wrap([resigned, turnEnd, turnEnd, other]);
    expect(roundsOf(events, 0, 2)).toEqual([0, 0, 0, 1]);
  });

  test("an empty list has no rounds", () => {
    expect(roundsOf([], 0, 4)).toEqual([]);
    expect(roundsOf([], 10, 4)).toEqual([]);
  });
});
