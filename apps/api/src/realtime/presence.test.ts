import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { createPresenceTracker } from "./presence.ts";
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

  describe("track", () => {
    test("reconnecting starts a new grace time, as at API start", () => {
      tracker.track(GAME, ANN, "reconnecting");
      expect(tracker.status(GAME, ANN)).toBe("reconnecting");
      vi.advanceTimersByTime(GRACE);
      expect(tracker.status(GAME, ANN)).toBe("away");
    });

    test("a stream during the grace time keeps the user online", () => {
      tracker.track(GAME, ANN, "reconnecting");
      vi.advanceTimersByTime(GRACE / 2);
      tracker.connect(GAME, ANN);
      vi.advanceTimersByTime(GRACE * 2);
      expect(tracker.status(GAME, ANN)).toBe("online");
    });

    test("away is immediate, as at restore, and starts no timer", () => {
      tracker.track(GAME, ANN, "away");
      expect(tracker.status(GAME, ANN)).toBe("away");
      expect(vi.getTimerCount()).toBe(0);
    });

    test("does nothing for a user with an open stream", () => {
      tracker.connect(GAME, ANN);
      tracker.track(GAME, ANN, "away");
      tracker.track(GAME, ANN, "reconnecting");
      expect(tracker.status(GAME, ANN)).toBe("online");
      expect(statuses()).toEqual([`${ANN}:online`]);
    });

    test("tracking away twice reports no change", () => {
      tracker.track(GAME, ANN, "away");
      tracker.track(GAME, ANN, "away");
      expect(statuses()).toEqual([]);
    });
  });

  describe("forget and close", () => {
    test("forget drops the game and its timers", () => {
      tracker.connect(GAME, ANN)();
      tracker.track(GAME, BOB, "reconnecting");
      expect(vi.getTimerCount()).toBe(2);

      tracker.forget(GAME);

      expect(vi.getTimerCount()).toBe(0);
      expect(tracker.status(GAME, ANN)).toBeUndefined();
      expect(tracker.statuses(GAME)).toEqual({});
    });

    test("a stream that closes after forget changes nothing", () => {
      const close = tracker.connect(GAME, ANN);
      tracker.forget(GAME);
      changes.length = 0;
      close();
      expect(vi.getTimerCount()).toBe(0);
      expect(changes).toEqual([]);
    });

    test("a game can be tracked again after forget", () => {
      tracker.connect(GAME, ANN);
      tracker.forget(GAME);
      tracker.connect(GAME, ANN);
      expect(tracker.status(GAME, ANN)).toBe("online");
    });

    test("close drops every game", () => {
      tracker.track(GAME, ANN, "reconnecting");
      tracker.track(OTHER_GAME, BOB, "reconnecting");
      tracker.close();
      expect(vi.getTimerCount()).toBe(0);
    });
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
    injected.connect(GAME, ANN)();
    expect(vi.getTimerCount()).toBe(0);
    injected.connect(GAME, ANN);
    expect(cleared).toEqual([1]);
    callbacks[0]?.();
    expect(injected.status(GAME, ANN)).toBe("online");
  });
});
