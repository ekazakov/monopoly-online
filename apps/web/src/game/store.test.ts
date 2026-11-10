import { describe, expect, test, vi } from "vite-plus/test";
import { snapshotMessageSchema } from "@monopoly/shared";
import type { EventLogEntry } from "@monopoly/shared";
import {
  actionResponse,
  actionsMessage,
  presenceMessage,
  recordFixture,
  redact,
  roomMessage,
  snapshotMessage,
  roomOf,
  withStatus,
  topicOf,
} from "./fixtures.ts";
import {
  applyActionResponse,
  applyRoomResponse,
  applyStartResponse,
  applyStateResponse,
  applyStreamMessage,
  createGameStore,
  initialGameState,
  MAX_LOGGED_EVENTS,
} from "./store.ts";
import type { GameStoreState } from "./store.ts";

const fx = recordFixture(8);
const [s1, s2, s3, s4, s5, s6] = fx.steps;
if (!s1 || !s2 || !s3 || !s4 || !s5 || !s6) throw new Error("fixture too short");

const start = snapshotMessage(fx.game, redact(fx.start));
const apply = (state: GameStoreState, ...messages: Parameters<typeof applyStreamMessage>[1][]) =>
  messages.reduce(applyStreamMessage, state);

describe("snapshot", () => {
  test("a waiting game has a room and no state", () => {
    const waiting = withStatus(fx.game, "waiting");
    const next = applyStreamMessage(initialGameState, snapshotMessage(waiting, null));
    expect(next).toMatchObject({ game: waiting, state: null, version: 0, status: "ready" });
  });

  test("the start snapshot sets the state at version 0", () => {
    const next = applyStreamMessage(initialGameState, start);
    expect(next.state?.version).toBe(0);
    expect(next.version).toBe(0);
    expect(next.events).toEqual([]);
    expect(next.status).toBe("ready");
  });

  test("a reconnect snapshot at a higher version keeps the log", () => {
    const live = apply(
      initialGameState,
      start,
      actionsMessage(fx.game, s1),
      actionsMessage(fx.game, s2),
    );
    const next = applyStreamMessage(live, snapshotMessage(fx.game, s4.state));
    expect(next.version).toBe(4);
    expect(next.state).toEqual(s4.state);
    expect(next.events).toBe(live.events);
    expect(next.lastActionEvents).toEqual([]);
    expect(next.gapDetected).toBe(false);
  });

  test("a snapshot at the same version keeps the last action events", () => {
    const live = apply(initialGameState, start, actionsMessage(fx.game, s1));
    const next = applyStreamMessage(live, snapshotMessage(fx.game, s1.state));
    expect(next.lastActionEvents).toEqual(s1.events);
  });

  test("a snapshot at a lower version resets the log", () => {
    const live = apply(
      initialGameState,
      start,
      actionsMessage(fx.game, s1),
      actionsMessage(fx.game, s2),
    );
    const next = applyStreamMessage(live, snapshotMessage(fx.game, s1.state));
    expect(next.version).toBe(1);
    expect(next.events).toEqual([]);
    expect(next.droppedEvents).toBe(0);
  });

  test("a snapshot of another game resets the log", () => {
    const live = apply(initialGameState, start, actionsMessage(fx.game, s1));
    const other = recordFixture(2, 11);
    const next = applyStreamMessage(
      live,
      snapshotMessage(other.game, other.steps[1]?.state ?? null),
    );
    expect(next.game).toEqual(other.game);
    expect(next.version).toBe(2);
    expect(next.events).toEqual([]);
  });

  test("a snapshot clears the gap flag", () => {
    const gap = apply(initialGameState, start, actionsMessage(fx.game, s3));
    expect(gap.gapDetected).toBe(true);
    expect(applyStreamMessage(gap, snapshotMessage(fx.game, s3.state)).gapDetected).toBe(false);
  });
});

describe("game.actions", () => {
  test("a sequence replaces the state and fills the log", () => {
    const next = apply(
      initialGameState,
      start,
      actionsMessage(fx.game, s1),
      actionsMessage(fx.game, s2),
      actionsMessage(fx.game, s3),
    );
    expect(next.state).toEqual(s3.state);
    expect(next.version).toBe(3);
    expect(next.gapDetected).toBe(false);
    expect(next.lastActionEvents).toEqual(s3.events);
    const all = [s1, s2, s3].flatMap((s) =>
      s.events.map((event) => ({ version: s.state.version, event })),
    );
    expect(next.events).toEqual(all);
  });

  test("a duplicate changes nothing", () => {
    const live = apply(
      initialGameState,
      start,
      actionsMessage(fx.game, s1),
      actionsMessage(fx.game, s2),
    );
    expect(applyStreamMessage(live, actionsMessage(fx.game, s2))).toBe(live);
  });

  test("a stale message never moves the state back", () => {
    const live = apply(
      initialGameState,
      start,
      actionsMessage(fx.game, s1),
      actionsMessage(fx.game, s2),
    );
    const next = applyStreamMessage(live, actionsMessage(fx.game, s1));
    expect(next).toBe(live);
    expect(next.version).toBe(2);
  });

  test("a gap is applied and flagged", () => {
    const live = apply(initialGameState, start, actionsMessage(fx.game, s1));
    const next = applyStreamMessage(live, actionsMessage(fx.game, s4));
    expect(next.state).toEqual(s4.state);
    expect(next.version).toBe(4);
    expect(next.gapDetected).toBe(true);
    expect(next.lastActionEvents).toEqual(s4.events);
    // The flag stays until the UI clears it, also when the next message is in order.
    expect(applyStreamMessage(next, actionsMessage(fx.game, s5)).gapDetected).toBe(true);
  });

  test("out-of-order messages end at the newest state", () => {
    const next = apply(
      initialGameState,
      start,
      actionsMessage(fx.game, s2),
      actionsMessage(fx.game, s1),
      actionsMessage(fx.game, s3),
    );
    expect(next.version).toBe(3);
    expect(next.state).toEqual(s3.state);
  });

  test("a message of another game is ignored", () => {
    const live = apply(initialGameState, start);
    const other = recordFixture(1, 11);
    const step = other.steps[0];
    if (!step) throw new Error("no step");
    expect(applyStreamMessage(live, actionsMessage(other.game, step))).toBe(live);
  });

  test("the log is capped and counts the dropped events", () => {
    const perMessage = s1.events.length;
    expect(perMessage).toBeGreaterThan(0);
    const total = Math.ceil(MAX_LOGGED_EVENTS / perMessage) + 3;
    let state = apply(initialGameState, start);
    for (let version = 1; version <= total; version++) {
      const message = actionsMessage(fx.game, s1);
      if (message.type !== "game.actions") throw new Error("type");
      state = applyStreamMessage(state, {
        ...message,
        version,
        payload: { ...message.payload, state: { ...message.payload.state, version } },
      });
    }
    expect(state.events).toHaveLength(MAX_LOGGED_EVENTS);
    expect(state.droppedEvents).toBe(total * perMessage - MAX_LOGGED_EVENTS);
    expect(state.events.at(-1)?.version).toBe(total);
  });
});

describe("room.updated", () => {
  test("replaces the room and keeps the state", () => {
    const live = apply(initialGameState, start, actionsMessage(fx.game, s1));
    const room = { ...fx.game, name: "Renamed" };
    const next = applyStreamMessage(live, roomMessage(room));
    expect(next.game).toEqual(room);
    expect(next.state).toBe(live.state);
    expect(next.events).toBe(live.events);
    expect(next.version).toBe(1);
  });

  test("a room for a game that is not loaded makes it ready", () => {
    const next = applyStreamMessage(initialGameState, roomMessage(fx.game));
    expect(next).toMatchObject({ game: fx.game, state: null, status: "ready" });
  });

  test("a room of another game is ignored", () => {
    const live = apply(initialGameState, start);
    expect(applyStreamMessage(live, roomMessage(roomOf().game))).toBe(live);
  });
});

describe("action response", () => {
  test("applies a newer state and the events", () => {
    const live = apply(initialGameState, start);
    const next = applyActionResponse(live, actionResponse(s1));
    expect(next.state).toEqual(s1.state);
    expect(next.version).toBe(1);
    expect(next.lastActionEvents).toEqual(s1.events);
    expect(next.events).toHaveLength(s1.events.length);
  });

  test("the stream message after the response changes nothing", () => {
    const live = applyActionResponse(apply(initialGameState, start), actionResponse(s1));
    expect(applyStreamMessage(live, actionsMessage(fx.game, s1))).toBe(live);
  });

  test("the response after the stream message changes nothing", () => {
    const live = apply(initialGameState, start, actionsMessage(fx.game, s1));
    expect(applyActionResponse(live, actionResponse(s1))).toBe(live);
  });

  test("a repeated clientActionId uses the state version and logs nothing twice", () => {
    // The stream delivered action 1; the client missed 2 and 3 and repeats action 1 by id.
    const live = apply(initialGameState, start, actionsMessage(fx.game, s1));
    const repeat = actionResponse(s1, s3);
    expect(repeat.version).toBe(1);
    expect(repeat.state.version).toBe(3);
    const next = applyActionResponse(live, repeat);
    expect(next.state).toEqual(s3.state);
    expect(next.version).toBe(3);
    expect(next.events).toBe(live.events);
    expect(next.lastActionEvents).toEqual([]);
    expect(next.gapDetected).toBe(true);
  });

  test("a repeated response with no earlier message logs the stored events", () => {
    const live = apply(initialGameState, start);
    const next = applyActionResponse(live, actionResponse(s1, s2));
    expect(next.version).toBe(2);
    expect(next.events.map((e) => e.version)).toEqual(s1.events.map(() => 1));
    expect(next.lastActionEvents).toEqual([]);
  });

  test("a repeat that is not newer changes nothing", () => {
    const live = apply(
      initialGameState,
      start,
      actionsMessage(fx.game, s1),
      actionsMessage(fx.game, s2),
    );
    expect(applyActionResponse(live, actionResponse(s1, s2))).toBe(live);
  });
});

describe("state and start responses", () => {
  test("a refetched state clears the gap", () => {
    const gap = apply(initialGameState, start, actionsMessage(fx.game, s3));
    const next = applyStateResponse(gap, { version: 4, state: s4.state });
    expect(next.state).toEqual(s4.state);
    expect(next.gapDetected).toBe(false);
    expect(next.lastActionEvents).toEqual([]);
  });

  test("a refetched state at the same version clears the gap, an older one does not", () => {
    const gap = apply(initialGameState, start, actionsMessage(fx.game, s3));
    expect(applyStateResponse(gap, { version: 3, state: s3.state })).toMatchObject({
      gapDetected: false,
      state: s3.state,
    });
    expect(applyStateResponse(gap, { version: 2, state: s2.state })).toBe(gap);
  });

  test("the start response is a snapshot", () => {
    const state = redact(fx.start);
    const next = applyStartResponse(initialGameState, { game: fx.game, state });
    expect(next).toMatchObject({ game: fx.game, state, version: 0, status: "ready" });
  });
});

describe("store", () => {
  test("notifies on a change and not on an ignored message", () => {
    const store = createGameStore();
    const listener = vi.fn<() => void>();
    const unsubscribe = store.subscribe(listener);
    store.applyStreamMessage(start);
    expect(listener).toHaveBeenCalledTimes(1);
    store.applyStreamMessage(start);
    store.applyStreamMessage(actionsMessage(fx.game, s1));
    expect(listener).toHaveBeenCalledTimes(3);
    store.applyStreamMessage(actionsMessage(fx.game, s1));
    store.applyActionResponse(actionResponse(s1));
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
    store.applyStreamMessage(actionsMessage(fx.game, s2));
    expect(listener).toHaveBeenCalledTimes(3);
    expect(store.getState().version).toBe(2);
  });

  test("connection, loading, gap and reset", () => {
    const store = createGameStore();
    expect(store.getState()).toMatchObject({ status: "idle", connection: "closed" });
    store.setLoading();
    expect(store.getState().status).toBe("loading");
    store.setConnection("open");
    store.applyStreamMessage(start);
    store.setLoading();
    expect(store.getState()).toMatchObject({ status: "ready", connection: "open" });
    store.applyStreamMessage(actionsMessage(fx.game, s3));
    expect(store.getState().gapDetected).toBe(true);
    store.clearGap();
    expect(store.getState().gapDetected).toBe(false);
    store.reset();
    expect(store.getState()).toEqual({ ...initialGameState, connection: "open" });
  });
});

describe("applyRoomResponse", () => {
  test("sets the room and keeps the state", () => {
    const withState = apply(initialGameState, start);
    const room = { ...fx.game, name: "Renamed", version: fx.game.version + 1 };
    const next = applyRoomResponse(withState, room);
    expect(next.game?.name).toBe("Renamed");
    expect(next.state).toBe(withState.state);
    expect(next.status).toBe("ready");
  });

  test("ignores a room older than the one in the store", () => {
    const newer = { ...fx.game, version: 5 };
    const state = applyRoomResponse(initialGameState, newer);
    expect(applyRoomResponse(state, { ...fx.game, version: 4 })).toBe(state);
  });
});

describe("applyStateResponse: first state", () => {
  test("takes a state at version 0 when the store has none", () => {
    const state = redact(fx.start);
    const next = applyStateResponse(initialGameState, { version: 0, state });
    expect(next.state).toBe(state);
    expect(next.version).toBe(0);
  });
});

describe("save, finish and restore snapshots", () => {
  const live = () =>
    apply(
      initialGameState,
      start,
      actionsMessage(fx.game, s1),
      actionsMessage(fx.game, s2),
      actionsMessage(fx.game, s3),
    );
  // A rollback gives the state of an earlier version a higher version number.
  const rolledBack = { ...redact(fx.start), version: s3.state.version + 1 };

  test("a saved game takes the snapshot with its status and drops the discarded log", () => {
    const saved = withStatus({ ...fx.game, version: rolledBack.version }, "saved");
    const next = applyStreamMessage(live(), snapshotMessage(saved, rolledBack));
    expect(next.game?.status).toBe("saved");
    expect(next.state).toEqual(rolledBack);
    expect(next.version).toBe(rolledBack.version);
    expect(next.events).toEqual([]);
    expect(next.lastActionEvents).toEqual([]);
    expect(next.status).toBe("ready");
  });

  test("a finished game takes the snapshot the same way", () => {
    const finished = withStatus({ ...fx.game, version: rolledBack.version }, "finished");
    const next = applyStreamMessage(live(), snapshotMessage(finished, rolledBack));
    expect(next.game?.status).toBe("finished");
    expect(next.events).toEqual([]);
  });

  test("the snapshot of a restore repeats the version and is taken", () => {
    const saved = withStatus({ ...fx.game, version: rolledBack.version }, "saved");
    const savedState = applyStreamMessage(live(), snapshotMessage(saved, rolledBack));
    const restored = withStatus({ ...saved }, "active");
    const next = applyStreamMessage(savedState, snapshotMessage(restored, rolledBack));
    expect(next.game?.status).toBe("active");
    expect(next.version).toBe(rolledBack.version);
    expect(next.events).toEqual([]);
  });

  test("the next action after a restore applies on the new version", () => {
    const saved = withStatus({ ...fx.game, version: rolledBack.version }, "saved");
    const restored = withStatus(saved, "active");
    const base = apply(
      live(),
      snapshotMessage(saved, rolledBack),
      snapshotMessage(restored, rolledBack),
    );
    const again = { ...s1, state: { ...s1.state, version: rolledBack.version + 1 } };
    const next = applyStreamMessage(base, actionsMessage(fx.game, again));
    expect(next.version).toBe(rolledBack.version + 1);
    expect(next.gapDetected).toBe(false);
    expect(next.events.map((e) => e.version)).toEqual(again.events.map(() => again.state.version));
  });
});

describe("presence.updated", () => {
  const [seatA, seatB] = fx.game.seats.map((seat) => seat.id) as [string, string];
  const active = () => apply(initialGameState, start);

  test("starts empty", () => {
    expect(initialGameState.presence).toEqual({});
    expect(active().presence).toEqual({});
  });

  test("replaces the map each time", () => {
    const first = applyStreamMessage(
      active(),
      presenceMessage(fx.game, { [seatA]: "online", [seatB]: "reconnecting" }),
    );
    expect(first.presence).toEqual({ [seatA]: "online", [seatB]: "reconnecting" });
    const second = applyStreamMessage(first, presenceMessage(fx.game, { [seatA]: "away" }));
    expect(second.presence).toEqual({ [seatA]: "away" });
  });

  test("a reconnect snapshot keeps the presence", () => {
    const withPresence = applyStreamMessage(
      active(),
      presenceMessage(fx.game, { [seatA]: "online" }),
    );
    const next = applyStreamMessage(withPresence, snapshotMessage(fx.game, s4.state));
    expect(next.presence).toEqual({ [seatA]: "online" });
  });

  test("a snapshot of a game that is not active clears it", () => {
    const withPresence = applyStreamMessage(
      active(),
      presenceMessage(fx.game, { [seatA]: "online" }),
    );
    const saved = withStatus(fx.game, "saved");
    const next = applyStreamMessage(withPresence, snapshotMessage(saved, s4.state));
    expect(next.presence).toEqual({});
  });

  test("a late message of a game that is not active is dropped", () => {
    const saved = applyStreamMessage(
      active(),
      snapshotMessage(withStatus(fx.game, "saved"), s4.state),
    );
    const next = applyStreamMessage(saved, presenceMessage(fx.game, { [seatA]: "online" }));
    expect(next).toBe(saved);
  });

  test("a message of another game is ignored", () => {
    const other = recordFixture(1, 11).game;
    const state = active();
    expect(applyStreamMessage(state, presenceMessage(other, { [seatA]: "away" }))).toBe(state);
  });

  test("the same map still notifies once, and reset clears it", () => {
    const store = createGameStore();
    store.applyStreamMessage(start);
    const listener = vi.fn<() => void>();
    store.subscribe(listener);
    store.applyStreamMessage(presenceMessage(fx.game, { [seatA]: "online" }));
    expect(listener).toHaveBeenCalledTimes(1);
    store.reset();
    expect(store.getState().presence).toEqual({});
  });
});

describe("snapshot event log", () => {
  const entryOf = (step: typeof s1): EventLogEntry => ({
    version: step.state.version,
    events: step.events,
  });
  /** A snapshot that carries the whole event log, as the API sends it. */
  const withLog = (state: typeof s1.state, events: EventLogEntry[]) =>
    snapshotMessageSchema.parse({
      topic: topicOf(fx.game),
      type: "snapshot",
      version: state.version,
      payload: { game: fx.game, state, events },
    });

  test("a snapshot with events fills the log after a refresh", () => {
    const next = applyStreamMessage(
      initialGameState,
      withLog(s2.state, [entryOf(s1), entryOf(s2)]),
    );
    expect(next.events).toEqual([
      ...s1.events.map((event) => ({ version: s1.state.version, event })),
      ...s2.events.map((event) => ({ version: s2.state.version, event })),
    ]);
    expect(next.droppedEvents).toBe(0);
    expect(next.lastActionEvents).toEqual([]);
    expect(next.version).toBe(s2.state.version);
  });

  test("a snapshot with events replaces the log kept so far", () => {
    const live = apply(initialGameState, start, actionsMessage(fx.game, s1));
    const next = applyStreamMessage(live, withLog(s2.state, [entryOf(s1), entryOf(s2)]));
    expect(next.events).toHaveLength(s1.events.length + s2.events.length);
    expect(next.lastActionEvents).toEqual([]);
  });

  test("a snapshot with an empty log clears the log", () => {
    const live = apply(initialGameState, start, actionsMessage(fx.game, s1));
    const next = applyStreamMessage(live, withLog(s1.state, []));
    expect(next.events).toEqual([]);
    expect(next.droppedEvents).toBe(0);
  });

  test("a snapshot with more events than the cap keeps the last ones", () => {
    const event = s1.events[0];
    if (!event) throw new Error("fixture step has no events");
    const count = MAX_LOGGED_EVENTS + 5;
    const entry: EventLogEntry = { version: s1.state.version, events: Array(count).fill(event) };
    const next = applyStreamMessage(initialGameState, withLog(s1.state, [entry]));
    expect(next.events).toHaveLength(MAX_LOGGED_EVENTS);
    expect(next.droppedEvents).toBe(5);
  });
});
