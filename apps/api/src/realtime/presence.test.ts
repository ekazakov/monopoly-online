import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { createApp } from "../app.ts";
import { createDb } from "../db/client.ts";
import { migrateToLatest } from "../db/migrations.ts";
import { startedGame } from "./test-helpers.ts";
import { createPresenceTracker, watchActiveGames } from "./presence.ts";
import type { PresenceChange, PresenceTracker } from "./presence.ts";

const GAME = "game-1";
const OTHER_GAME = "game-2";
const ANN = "user-ann";
const BOB = "user-bob";
const GRACE = 60_000;

describe("presence tracker", () => {
  let changes: PresenceChange[];
  let tracker: PresenceTracker;

  beforeEach(() => {
    vi.useFakeTimers();
    changes = [];
    tracker = createPresenceTracker({ graceMs: GRACE, onChange: (c) => changes.push(c) });
    // A started game: both players are known and have no stream yet. Start from a clean record.
    tracker.watch(GAME, [ANN, BOB], "away");
    changes.length = 0;
  });

  afterEach(() => {
    tracker.close();
    vi.useRealTimers();
  });

  const statuses = () => changes.map((c) => `${c.userId}:${c.status}`);

  test("a stream makes a user online, and closing it starts the grace time", () => {
    const close = tracker.connect(GAME, ANN);
    expect(tracker.status(GAME, ANN)).toBe("online");

    close();
    expect(tracker.status(GAME, ANN)).toBe("reconnecting");

    vi.advanceTimersByTime(GRACE - 1);
    expect(tracker.status(GAME, ANN)).toBe("reconnecting");
    vi.advanceTimersByTime(1);
    expect(tracker.status(GAME, ANN)).toBe("away");
    expect(statuses()).toEqual([`${ANN}:online`, `${ANN}:reconnecting`, `${ANN}:away`]);
  });

  test("two tabs: the user stays online until the last stream closes", () => {
    const first = tracker.connect(GAME, ANN);
    const second = tracker.connect(GAME, ANN);
    expect(statuses()).toEqual([`${ANN}:online`]);

    first();
    vi.advanceTimersByTime(GRACE * 2);
    expect(tracker.status(GAME, ANN)).toBe("online");

    second();
    expect(tracker.status(GAME, ANN)).toBe("reconnecting");
    vi.advanceTimersByTime(GRACE);
    expect(tracker.status(GAME, ANN)).toBe("away");
  });

  test("closing one stream twice counts once", () => {
    const first = tracker.connect(GAME, ANN);
    tracker.connect(GAME, ANN);
    first();
    first();
    expect(tracker.status(GAME, ANN)).toBe("online");
  });

  test("a return within the grace time stops the timer", () => {
    tracker.connect(GAME, ANN)();
    vi.advanceTimersByTime(GRACE - 1);

    tracker.connect(GAME, ANN);
    expect(tracker.status(GAME, ANN)).toBe("online");
    vi.advanceTimersByTime(GRACE * 3);
    expect(tracker.status(GAME, ANN)).toBe("online");
    expect(statuses()).toEqual([`${ANN}:online`, `${ANN}:reconnecting`, `${ANN}:online`]);
  });

  test("a return after away makes the user online again", () => {
    tracker.connect(GAME, ANN)();
    vi.advanceTimersByTime(GRACE);
    expect(tracker.status(GAME, ANN)).toBe("away");

    tracker.connect(GAME, ANN);
    expect(tracker.status(GAME, ANN)).toBe("online");
    expect(statuses().at(-1)).toBe(`${ANN}:online`);
  });

  test("a topic change: the old game goes reconnecting and the new one online", () => {
    tracker.watch(OTHER_GAME, [ANN], "away");
    const closeOld = tracker.connect(GAME, ANN);
    // The client closes the stream for game 1 and opens one for game 2.
    closeOld();
    tracker.connect(OTHER_GAME, ANN);

    expect(tracker.status(GAME, ANN)).toBe("reconnecting");
    expect(tracker.status(OTHER_GAME, ANN)).toBe("online");
    vi.advanceTimersByTime(GRACE);
    expect(tracker.status(GAME, ANN)).toBe("away");
    expect(tracker.status(OTHER_GAME, ANN)).toBe("online");
  });

  test("users and games do not affect each other", () => {
    tracker.connect(GAME, ANN);
    tracker.connect(GAME, BOB)();
    expect(tracker.statuses(GAME)).toEqual({ [ANN]: "online", [BOB]: "reconnecting" });
    expect(tracker.statuses(OTHER_GAME)).toEqual({});
    vi.advanceTimersByTime(GRACE);
    expect(tracker.statuses(GAME)).toEqual({ [ANN]: "online", [BOB]: "away" });
  });

  describe("streams of a game that is not watched", () => {
    test("have no status, and the tracker keeps nothing after they close", () => {
      const close = tracker.connect(OTHER_GAME, ANN);
      expect(tracker.status(OTHER_GAME, ANN)).toBeUndefined();
      expect(tracker.statuses(OTHER_GAME)).toEqual({});
      close();
      expect(vi.getTimerCount()).toBe(0);
      expect(changes).toEqual([]);
    });

    test("count when the game starts: watch finds the user online", () => {
      tracker.connect(OTHER_GAME, ANN);
      tracker.connect(OTHER_GAME, ANN);
      tracker.watch(OTHER_GAME, [ANN, BOB], "reconnecting");
      expect(tracker.statuses(OTHER_GAME)).toEqual({ [ANN]: "online", [BOB]: "reconnecting" });
    });
  });

  describe("watch", () => {
    test("reconnecting starts a new grace time, as at API start", () => {
      tracker.watch(OTHER_GAME, [ANN], "reconnecting");
      expect(tracker.status(OTHER_GAME, ANN)).toBe("reconnecting");
      vi.advanceTimersByTime(GRACE);
      expect(tracker.status(OTHER_GAME, ANN)).toBe("away");
    });

    test("a stream during the grace time keeps the user online", () => {
      tracker.watch(OTHER_GAME, [ANN], "reconnecting");
      vi.advanceTimersByTime(GRACE / 2);
      tracker.connect(OTHER_GAME, ANN);
      vi.advanceTimersByTime(GRACE * 2);
      expect(tracker.status(OTHER_GAME, ANN)).toBe("online");
    });

    test("away is immediate, as at restore, and starts no timer", () => {
      tracker.watch(OTHER_GAME, [ANN], "away");
      expect(tracker.status(OTHER_GAME, ANN)).toBe("away");
      expect(vi.getTimerCount()).toBe(0);
    });

    test("a user with an open stream is online, whatever the initial status", () => {
      tracker.connect(GAME, ANN);
      tracker.watch(GAME, [ANN], "away");
      tracker.watch(GAME, [ANN], "reconnecting");
      expect(tracker.status(GAME, ANN)).toBe("online");
      expect(statuses()).toEqual([`${ANN}:online`]);
    });

    test("watching again with the same status reports no change", () => {
      tracker.watch(GAME, [ANN], "away");
      expect(statuses()).toEqual([]);
    });
  });

  describe("forget and close", () => {
    test("forget drops the status and the timers of the game", () => {
      tracker.connect(GAME, ANN)();
      tracker.watch(GAME, [BOB], "reconnecting");
      expect(vi.getTimerCount()).toBe(2);

      tracker.forget(GAME);

      expect(vi.getTimerCount()).toBe(0);
      expect(tracker.status(GAME, ANN)).toBeUndefined();
      expect(tracker.statuses(GAME)).toEqual({});
    });

    test("an open stream stays counted after forget, for a restore", () => {
      const close = tracker.connect(GAME, ANN);
      tracker.forget(GAME);
      expect(tracker.status(GAME, ANN)).toBeUndefined();

      changes.length = 0;
      tracker.watch(GAME, [ANN, BOB], "away");
      expect(tracker.statuses(GAME)).toEqual({ [ANN]: "online", [BOB]: "away" });

      close();
      expect(tracker.status(GAME, ANN)).toBe("reconnecting");
    });

    test("a stream that closes after forget changes nothing", () => {
      const close = tracker.connect(GAME, ANN);
      tracker.forget(GAME);
      changes.length = 0;
      close();
      expect(vi.getTimerCount()).toBe(0);
      expect(changes).toEqual([]);
    });

    test("a timer that runs after forget changes nothing", () => {
      const callbacks: (() => void)[] = [];
      const manual = createPresenceTracker({
        graceMs: GRACE,
        timers: { set: (callback) => callbacks.push(callback), clear: () => {} },
        onChange: (c) => changes.push(c),
      });
      manual.watch(GAME, [ANN], "reconnecting");
      manual.forget(GAME);
      changes.length = 0;
      callbacks[0]?.();
      expect(changes).toEqual([]);
      expect(manual.status(GAME, ANN)).toBeUndefined();
    });

    test("a game can be watched again after forget", () => {
      tracker.forget(GAME);
      tracker.watch(GAME, [ANN], "away");
      tracker.connect(GAME, ANN);
      expect(tracker.status(GAME, ANN)).toBe("online");
    });

    test("close drops every game", () => {
      tracker.watch(GAME, [ANN], "reconnecting");
      tracker.watch(OTHER_GAME, [BOB], "reconnecting");
      tracker.close();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  test("subscribe gets the changes until it is stopped", () => {
    const heard: string[] = [];
    const stop = tracker.subscribe((c) => heard.push(`${c.userId}:${c.status}`));
    tracker.connect(GAME, ANN);
    stop();
    tracker.connect(GAME, BOB);
    expect(heard).toEqual([`${ANN}:online`]);
    expect(statuses()).toEqual([`${ANN}:online`, `${BOB}:online`]);
  });

  test("injected timers replace the global ones", () => {
    const callbacks: (() => void)[] = [];
    const cleared: unknown[] = [];
    const injected = createPresenceTracker({
      graceMs: 5,
      timers: {
        set: (callback, ms) => {
          expect(ms).toBe(5);
          callbacks.push(callback);
          return callbacks.length;
        },
        clear: (handle) => cleared.push(handle),
      },
    });
    injected.watch(GAME, [ANN], "away");
    injected.connect(GAME, ANN)();
    expect(vi.getTimerCount()).toBe(0);
    injected.connect(GAME, ANN);
    expect(cleared).toEqual([1]);
    callbacks[0]?.();
    expect(injected.status(GAME, ANN)).toBe("online");
  });
});

/** A tracker whose grace timers never run: for the app that starts the game. */
const idleTracker = () => createPresenceTracker({ timers: { set: () => null, clear: () => {} } });

describe("watchActiveGames", () => {
  test("a game with nobody back saves itself after an API restart", async () => {
    // The first app starts a game. A new tracker and app on the same database stand for the restart.
    const db = createDb(":memory:");
    await migrateToLatest(db);
    try {
      const first = createApp(db, { seed: () => 2, presence: idleTracker() });
      const started = await startedGame(first, 2);

      const callbacks: (() => void)[] = [];
      const restarted = createPresenceTracker({
        graceMs: GRACE,
        timers: { set: (callback) => callbacks.push(callback), clear: () => {} },
      });
      createApp(db, { seed: () => 2, presence: restarted });
      expect(await watchActiveGames(db, restarted)).toBe(1);

      // Both controllers wait out a new grace time. The owner also controls the hot-seat seat.
      expect(restarted.statuses(started.game.id)).toEqual({
        [started.owner.user.id]: "reconnecting",
        [started.guest.user.id]: "reconnecting",
      });
      expect(callbacks).toHaveLength(2);
      for (const fire of callbacks) fire();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const game = await db
        .selectFrom("games")
        .select("status")
        .where("id", "=", started.game.id)
        .executeTakeFirstOrThrow();
      expect(game.status).toBe("saved");
    } finally {
      await db.destroy();
    }
  });

  test("a player who comes back in time keeps the game active", async () => {
    const db = createDb(":memory:");
    await migrateToLatest(db);
    try {
      const first = createApp(db, { seed: () => 2, presence: idleTracker() });
      const started = await startedGame(first, 2);
      const callbacks: (() => void)[] = [];
      const restarted = createPresenceTracker({
        graceMs: GRACE,
        timers: { set: (callback) => callbacks.push(callback), clear: () => {} },
      });
      createApp(db, { seed: () => 2, presence: restarted });
      await watchActiveGames(db, restarted);

      restarted.connect(started.game.id, started.guest.user.id);
      for (const fire of callbacks) fire();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const game = await db
        .selectFrom("games")
        .select("status")
        .where("id", "=", started.game.id)
        .executeTakeFirstOrThrow();
      expect(game.status).toBe("active");
      expect(restarted.status(started.game.id, started.owner.user.id)).toBe("away");
    } finally {
      await db.destroy();
    }
  });

  test("games that are not active are not watched", async () => {
    const db = createDb(":memory:");
    await migrateToLatest(db);
    try {
      const app = createApp(db, { seed: () => 2, presence: idleTracker() });
      const started = await startedGame(app, 2);
      await db.updateTable("games").set({ status: "saved" }).execute();
      const tracker = createPresenceTracker();
      expect(await watchActiveGames(db, tracker)).toBe(0);
      expect(tracker.statuses(started.game.id)).toEqual({});
    } finally {
      await db.destroy();
    }
  });
});
