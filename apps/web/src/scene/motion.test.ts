import type { GameEvent } from "@monopoly/shared";
import { describe, expect, test } from "vite-plus/test";
import type { MoveStep } from "./motion.ts";
import {
  HOP_MS,
  IDLE_PLAYBACK,
  JUMP_MS,
  ROLL_MS,
  createMotionQueue,
  hopAt,
  planMotion,
  restingSites,
  stepSquares,
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
      { kind: "walk", playerId: A, from: 2, fromJail: false, path: [3, 4, 5, 6, 7, 8, 9] },
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
    expect(planMotion([moved(7, 4)])).toEqual([
      { kind: "jump", playerId: A, from: 7, fromJail: false, to: 4 },
    ]);
  });

  test("walks to jail, from the Go to jail square, forward", () => {
    const steps = planMotion([moved(30, 10), jailed()]);
    expect(steps).toEqual([
      { kind: "walk", playerId: A, from: 30, fromJail: false, path: walkPath(30, 10) },
    ]);
    expect(walkPath(30, 10)).toHaveLength(20);
  });

  test("makes no step for SentToJail alone", () => {
    expect(planMotion([jailed()])).toEqual([]);
  });

  test("ignores a PassedGo or a SentToJail of another player for the direction", () => {
    expect(planMotion([moved(7, 4), passedGo("b")])).toEqual([
      { kind: "jump", playerId: A, from: 7, fromJail: false, to: 4 },
    ]);
    expect(planMotion([moved(7, 4), jailed("b")])).toEqual([
      { kind: "jump", playerId: A, from: 7, fromJail: false, to: 4 },
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
    expect(
      stepDuration({ kind: "walk", playerId: A, from: 0, fromJail: false, path: [1, 2, 3] }),
    ).toBe(HOP_MS * 3);
    expect(stepDuration({ kind: "jump", playerId: A, from: 7, fromJail: false, to: 4 })).toBe(
      JUMP_MS,
    );
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

const walk = (playerId: string, from: number, to: number, fromJail = false): MoveStep => ({
  kind: "walk",
  playerId,
  from,
  fromJail,
  path: walkPath(from, to),
});

describe("planMotion and the jail cell", () => {
  test("marks a move after LeftJail as a move out of the cell", () => {
    const steps = planMotion([rolled([3, 3]), { type: "LeftJail", playerId: A }, moved(10, 16)]);
    expect(steps[1]).toMatchObject({ kind: "walk", fromJail: true });
  });

  test("does not mark the move of another player", () => {
    const steps = planMotion([{ type: "LeftJail", playerId: "b" }, moved(10, 16)]);
    expect(steps[0]).toMatchObject({ fromJail: false });
  });
});

describe("stepSquares and hopAt", () => {
  test("lists the squares of a walk and of a jump", () => {
    expect(stepSquares(walk(A, 38, 1))).toEqual([38, 39, 0, 1]);
    expect(stepSquares({ kind: "jump", playerId: A, from: 7, fromJail: false, to: 4 })).toEqual([
      7, 4,
    ]);
  });

  test("gives the hop and its progress for a walk", () => {
    const step = walk(A, 0, 3);
    expect(hopAt(step, 0)).toEqual({ hop: 0, hops: 3, t: 0 });
    expect(hopAt(step, HOP_MS * 1.5)).toEqual({ hop: 1, hops: 3, t: 0.5 });
  });

  test("stays on the last hop at the end and after it", () => {
    const step = walk(A, 0, 3);
    expect(hopAt(step, HOP_MS * 3)).toEqual({ hop: 2, hops: 3, t: 1 });
    expect(hopAt(step, 99999)).toEqual({ hop: 2, hops: 3, t: 1 });
  });

  test("a jump is one hop that takes JUMP_MS", () => {
    const step: MoveStep = { kind: "jump", playerId: A, from: 7, fromJail: false, to: 4 };
    expect(hopAt(step, JUMP_MS / 2)).toEqual({ hop: 0, hops: 1, t: 0.5 });
  });

  test("treats a negative time as the start", () => {
    expect(hopAt(walk(A, 0, 3), -50)).toEqual({ hop: 0, hops: 3, t: 0 });
  });
});

describe("restingSites", () => {
  const sites = [
    { id: "a", square: 9, inJail: false },
    { id: "b", square: 20, inJail: false },
  ];

  test("keeps the squares of the state when nothing plays", () => {
    expect(restingSites(sites, IDLE_PLAYBACK)).toEqual(sites);
  });

  test("keeps a token on the start square of its move while the move waits or plays", () => {
    const playback = { current: walk("a", 3, 9), waiting: [walk("b", 14, 20)] };
    expect(restingSites(sites, playback).map((s) => s.square)).toEqual([3, 14]);
  });

  test("uses the first move of a token when it has several", () => {
    const playback = { current: null, waiting: [walk("a", 3, 6), walk("a", 6, 9)] };
    expect(restingSites(sites, playback)[0]!.square).toBe(3);
  });

  test("ignores a roll", () => {
    const playback = {
      current: { kind: "roll" as const, playerId: "a", dice: [1, 2] as [number, number] },
      waiting: [],
    };
    expect(restingSites(sites, playback)).toEqual(sites);
  });

  test("puts a token that leaves the jail back in the cell until its move", () => {
    const jailSites = [{ id: "a", square: 16, inJail: false }];
    const playback = { current: null, waiting: [walk("a", 10, 16, true)] };
    expect(restingSites(jailSites, playback)[0]).toEqual({ id: "a", square: 10, inJail: true });
  });
});

describe("createMotionQueue pending", () => {
  test("lists the waiting steps without taking them", () => {
    const queue = createMotionQueue();
    queue.push([rolled([1, 2]), moved(0, 3)]);
    expect(queue.pending().map((s) => s.kind)).toEqual(["roll", "walk"]);
    expect(queue.size).toBe(2);
  });
});
