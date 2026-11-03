import type { GameEvent } from "@monopoly/shared";
import { describe, expect, test } from "vite-plus/test";
import {
  HOP_MS,
  JUMP_MS,
  ROLL_MS,
  createMotionQueue,
  planMotion,
  stepDuration,
  walkPath,
} from "./motion.ts";

const A = "a";
const rolled = (dice: [number, number], playerId = A): GameEvent => ({
  type: "DiceRolled",
  playerId,
  dice,
});
const moved = (from: number, to: number, playerId = A): GameEvent => ({
  type: "PlayerMoved",
  playerId,
  from,
  to,
});
const passedGo = (playerId = A): GameEvent => ({ type: "PassedGo", playerId, amount: 200 });
const jailed = (playerId = A): GameEvent => ({ type: "SentToJail", playerId });

describe("walkPath", () => {
  test("lists the squares after `from`, up to and with `to`", () => {
    expect(walkPath(3, 7)).toEqual([4, 5, 6, 7]);
  });

  test("goes round the corner of the board", () => {
    expect(walkPath(38, 2)).toEqual([39, 0, 1, 2]);
  });

  test("has no square when the token does not move", () => {
    expect(walkPath(5, 5)).toEqual([]);
  });
});

describe("planMotion", () => {
  test("makes a roll, then a walk, from a dice move", () => {
    expect(planMotion([rolled([3, 4]), moved(2, 9)])).toEqual([
      { kind: "roll", playerId: A, dice: [3, 4] },
      { kind: "walk", playerId: A, from: 2, path: [3, 4, 5, 6, 7, 8, 9] },
    ]);
  });

  test("starts a walk at the `from` of its event", () => {
    const [step] = planMotion([moved(20, 22)]);
    expect(step).toMatchObject({ kind: "walk", from: 20, path: [21, 22] });
  });

  test("walks forward over Start, with the lap", () => {
    const [step] = planMotion([moved(37, 3), passedGo()]);
    expect(step).toMatchObject({ kind: "walk", path: [38, 39, 0, 1, 2, 3] });
  });

  test("walks to Start when the token lands on it", () => {
    const [step] = planMotion([moved(36, 0), passedGo()]);
    expect(step).toMatchObject({ kind: "walk", path: [37, 38, 39, 0] });
  });

  test("jumps for a card that sends the token back", () => {
    expect(planMotion([moved(7, 4)])).toEqual([{ kind: "jump", playerId: A, from: 7, to: 4 }]);
  });

  test("walks to jail, from the Go to jail square, forward", () => {
    const steps = planMotion([moved(30, 10), jailed()]);
    expect(steps).toEqual([{ kind: "walk", playerId: A, from: 30, path: walkPath(30, 10) }]);
    expect(walkPath(30, 10)).toHaveLength(20);
  });

  test("makes no step for SentToJail alone", () => {
    expect(planMotion([jailed()])).toEqual([]);
  });

  test("ignores a PassedGo or a SentToJail of another player for the direction", () => {
    expect(planMotion([moved(7, 4), passedGo("b")])).toEqual([
      { kind: "jump", playerId: A, from: 7, to: 4 },
    ]);
    expect(planMotion([moved(7, 4), jailed("b")])).toEqual([
      { kind: "jump", playerId: A, from: 7, to: 4 },
    ]);
  });

  test("makes no step for a move to the same square", () => {
    expect(planMotion([moved(5, 5)])).toEqual([]);
  });

  test("makes no step for events with no motion", () => {
    expect(
      planMotion([
        { type: "PropertyBought", playerId: A, square: 6, price: 100 },
        { type: "TurnEnded", playerId: A, nextPlayerId: "b" },
      ]),
    ).toEqual([]);
  });

  test("keeps the order of a roll, a move and a second move", () => {
    const steps = planMotion([rolled([2, 2]), moved(5, 9), moved(9, 12)]);
    expect(steps.map((s) => s.kind)).toEqual(["roll", "walk", "walk"]);
  });
});

describe("stepDuration", () => {
  test("gives the time of each kind of step", () => {
    expect(stepDuration({ kind: "roll", playerId: A, dice: [1, 2] })).toBe(ROLL_MS);
    expect(stepDuration({ kind: "walk", playerId: A, from: 0, path: [1, 2, 3] })).toBe(HOP_MS * 3);
    expect(stepDuration({ kind: "jump", playerId: A, from: 7, to: 4 })).toBe(JUMP_MS);
  });
});

describe("createMotionQueue", () => {
  test("hands out the steps of one action in order", () => {
    const queue = createMotionQueue();
    queue.push([rolled([1, 2]), moved(0, 3)]);
    expect(queue.size).toBe(2);
    expect(queue.next()?.kind).toBe("roll");
    expect(queue.next()?.kind).toBe("walk");
    expect(queue.next()).toBeUndefined();
    expect(queue.size).toBe(0);
  });

  test("puts the steps of a later action behind the steps that wait", () => {
    const queue = createMotionQueue();
    queue.push([rolled([1, 2], "a"), moved(0, 3, "a")]);
    queue.push([rolled([3, 3], "b"), moved(10, 16, "b")]);
    expect(queue.next()).toMatchObject({ kind: "roll", playerId: "a" });
    expect(queue.next()).toMatchObject({ kind: "walk", playerId: "a" });
    expect(queue.next()).toMatchObject({ kind: "roll", playerId: "b" });
    expect(queue.next()).toMatchObject({ kind: "walk", playerId: "b", from: 10 });
  });

  test("adds nothing for an action with no motion", () => {
    const queue = createMotionQueue();
    queue.push([{ type: "TurnEnded", playerId: A, nextPlayerId: "b" }]);
    expect(queue.size).toBe(0);
  });

  test("clear drops all waiting steps", () => {
    const queue = createMotionQueue();
    queue.push([rolled([1, 2]), moved(0, 3)]);
    queue.clear();
    expect(queue.size).toBe(0);
    expect(queue.next()).toBeUndefined();
  });
});
