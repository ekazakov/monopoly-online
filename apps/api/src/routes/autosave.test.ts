import { actorFor, applyAction } from "@monopoly/game-engine";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
// The app (and with it `@hono/zod-openapi`) loads before `@monopoly/shared`, as the zod extension needs.
import { createApp } from "../app.ts";
import { postJson, sendAs } from "../auth/test-helpers.ts";
import { streamMessageSchema } from "@monopoly/shared";
import type { StreamMessage } from "@monopoly/shared";
import type { Kysely } from "kysely";
import { createDb } from "../db/client.ts";
import { migrateToLatest } from "../db/migrations.ts";
import type { Database } from "../db/schema.ts";
import { deserializeState } from "../game/loader.ts";
import { playGame } from "../game/test-helpers.ts";
import { createBus } from "../realtime/bus.ts";
import { gameTopic } from "../realtime/messages.ts";
import type { StreamEnvelope } from "../realtime/messages.ts";
import { createPresenceTracker } from "../realtime/presence.ts";
import type { PresenceTracker } from "../realtime/presence.ts";
import { startedGame, submitStep } from "../realtime/test-helpers.ts";
import type { StartedGame } from "../realtime/test-helpers.ts";

const SEED = 2;

// The automatic save: when no controller of an active game is online, the game saves itself.
describe("automatic save", () => {
  let db: Kysely<Database>;
  let app: ReturnType<typeof createApp>;
  let tracker: PresenceTracker;
  let started: StartedGame;
  let seen: StreamMessage[];
  // The grace timers, run by hand and in the order they were set.
  let timers: { callback: () => void; live: boolean }[];

  beforeEach(async () => {
    db = createDb(":memory:");
    await migrateToLatest(db);
    timers = [];
    tracker = createPresenceTracker({
      graceMs: 60_000,
      timers: {
        set: (callback) => {
          const timer = { callback, live: true };
          timers.push(timer);
          return timer;
        },
        clear: (handle) => {
          (handle as { live: boolean }).live = false;
        },
      },
    });
    const bus = createBus<StreamEnvelope>();
    app = createApp(db, { seed: () => SEED, bus, presence: tracker });
    started = await startedGame(app, SEED);
    seen = [];
    bus.subscribe(gameTopic(started.game.id), (message) => {
      if (message.type !== "presence.updated") seen.push(streamMessageSchema.parse(message));
    });
  });

  afterEach(async () => {
    tracker.close();
    await db.destroy();
  });

  const gameId = () => started.game.id;
  const alice = () => started.owner.user.id;
  const bobby = () => started.guest.user.id;

  /** Run the next grace timer that is still live, and let the save finish. */
  async function expire() {
    const timer = timers.find((t) => t.live);
    if (!timer) throw new Error("No grace timer is running");
    timer.live = false;
    timer.callback();
    await settle();
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

  const gameRow = () =>
    db
      .selectFrom("games")
      .select(["status", "version"])
      .where("id", "=", gameId())
      .executeTakeFirstOrThrow();

  async function play(count: number) {
    for (const step of playGame(SEED, count, started.initial).steps) {
      expect((await submitStep(app, started, step)).status).toBe(200);
    }
  }

  async function turnStartState() {
    const row = await db
      .selectFrom("game_snapshots")
      .select("state")
      .where("turn_start", "=", 1)
      .orderBy("version", "desc")
      .executeTakeFirstOrThrow();
    return deserializeState(row.state);
  }

  test("all devices gone: the game saves itself after the grace time, with a snapshot", async () => {
    await play(8);
    const before = await gameRow();
    const turnStart = await turnStartState();
    const closeAlice = tracker.connect(gameId(), alice());
    const closeBobby = tracker.connect(gameId(), bobby());
    seen.length = 0;

    closeAlice();
    closeBobby();
    await settle();
    expect((await gameRow()).status).toBe("active");

    await expire();
    // Alice went away first: Bobby is still inside the grace time.
    expect((await gameRow()).status).toBe("active");
    await expire();

    expect(await gameRow()).toEqual({ status: "saved", version: before.version + 1 });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      type: "snapshot",
      version: before.version + 1,
      payload: { game: { status: "saved" }, state: { version: before.version + 1 } },
    });
    // The rollback is the one of Save: the turn is back at its start.
    expect(turnStart.version).toBeLessThan(before.version);
    const seats = await db.selectFrom("seats").select("claimed_at").execute();
    expect(seats.every((seat) => seat.claimed_at === null)).toBe(true);
  });

  test("one device online stops it", async () => {
    tracker.connect(gameId(), alice());
    tracker.connect(gameId(), bobby())();
    await expire();
    await settle();

    expect(tracker.status(gameId(), bobby())).toBe("away");
    expect((await gameRow()).status).toBe("active");
    expect(seen).toHaveLength(0);
  });

  test("a return at the last moment stops it", async () => {
    const closeAlice = tracker.connect(gameId(), alice());
    tracker.connect(gameId(), bobby())();
    closeAlice();
    // Bobby's grace time ends: Alice is still reconnecting.
    await expire();
    expect((await gameRow()).status).toBe("active");

    // Alice is back, and her old timer is gone: nothing is left to run.
    tracker.connect(gameId(), alice());
    expect(timers.some((t) => t.live)).toBe(false);
    await settle();

    expect(tracker.status(gameId(), alice())).toBe("online");
    expect((await gameRow()).status).toBe("active");
  });

  test("a return between the away change and the save stops it", async () => {
    const closeAlice = tracker.connect(gameId(), alice());
    closeAlice();
    // Alice goes away and the save is asked for. Bobby, whom the tracker does not know, connects
    // in the same moment: the queue asks again just before it saves.
    const timer = timers.find((t) => t.live)!;
    timer.live = false;
    timer.callback();
    tracker.connect(gameId(), bobby());
    await settle();

    expect((await gameRow()).status).toBe("active");
  });

  test("nobody ever arrives: the game saves itself after the grace time of the start", async () => {
    // Start gave both controllers a grace time. Nobody opened a stream.
    expect(tracker.statuses(gameId())).toEqual({
      [alice()]: "reconnecting",
      [bobby()]: "reconnecting",
    });
    await expire();
    expect((await gameRow()).status).toBe("active");
    await expire();
    expect((await gameRow()).status).toBe("saved");
  });

  test("a leaving game stops the timers: nothing is left to run", async () => {
    tracker.connect(gameId(), alice());
    expect(
      (await sendAs(app, "POST", `/api/games/${gameId()}/save`, started.owner.cookie)).status,
    ).toBe(200);
    expect(timers.some((t) => t.live)).toBe(false);
    expect(tracker.statuses(gameId())).toEqual({});
  });

  test("the owner can restore it and the same dice come back", async () => {
    await play(8);
    tracker.connect(gameId(), alice())();
    await expire();
    await expire();
    expect((await gameRow()).status).toBe("saved");
    const savedState = await turnStartState();
    // The owner opens the room of the saved game: a stream, which the tracker counts.
    tracker.connect(gameId(), alice());

    const restored = await sendAs(
      app,
      "POST",
      `/api/games/${gameId()}/restore`,
      started.owner.cookie,
    );
    expect(restored.status).toBe(200);

    const actor = actorFor(savedState);
    const expected = applyAction(savedState, { type: "RollDice", playerId: actor });
    expect(expected.ok).toBe(true);
    const res = await postJson(app, `/api/games/${gameId()}/actions`, started.cookieOfSeat(actor), {
      seatId: actor,
      action: { type: "RollDice" },
      expectedVersion: savedState.version,
      clientActionId: crypto.randomUUID(),
    });
    expect(res.status).toBe(200);
    if (!expected.ok) return;
    expect(((await res.json()) as { events: unknown }).events).toEqual(
      JSON.parse(JSON.stringify(expected.events)),
    );
  });

  describe("after a restore", () => {
    const restore = () =>
      sendAs(app, "POST", `/api/games/${gameId()}/restore`, started.owner.cookie);
    const save = () => sendAs(app, "POST", `/api/games/${gameId()}/save`, started.owner.cookie);

    test("a controller with a stream is online after the restore", async () => {
      tracker.connect(gameId(), alice());
      expect((await save()).status).toBe(200);
      // Both browsers are open on the room of the saved game.
      tracker.connect(gameId(), bobby());

      expect((await restore()).status).toBe(200);

      expect(tracker.statuses(gameId())).toEqual({ [alice()]: "online", [bobby()]: "online" });
      await settle();
      expect((await gameRow()).status).toBe("active");
    });

    test("the player who is not there is away at once, and the game waits for them", async () => {
      tracker.connect(gameId(), alice());
      expect((await save()).status).toBe(200);

      expect((await restore()).status).toBe(200);

      expect(tracker.statuses(gameId())).toEqual({ [alice()]: "online", [bobby()]: "away" });
      expect(timers.some((t) => t.live)).toBe(false);
      await settle();
      expect((await gameRow()).status).toBe("active");
    });

    test("with nobody online the restored game saves itself again", async () => {
      expect((await save()).status).toBe(200);
      expect((await restore()).status).toBe(200);
      await settle();
      expect((await gameRow()).status).toBe("saved");
    });
  });

  test("a game that is not active is left alone", async () => {
    await sendAs(app, "POST", `/api/games/${gameId()}/finish`, started.owner.cookie);
    const before = await gameRow();
    tracker.connect(gameId(), alice())();
    await settle();
    expect(timers.some((t) => t.live)).toBe(false);
    expect(await gameRow()).toEqual(before);
    expect(before.status).toBe("finished");
  });

  test("a save asked for twice saves once", async () => {
    tracker.connect(gameId(), alice())();
    tracker.connect(gameId(), bobby())();
    await expire();
    await expire();
    expect(await gameRow()).toEqual({ status: "saved", version: 1 });
    expect(seen).toHaveLength(1);
  });

  test("no route reaches it", async () => {
    for (const path of ["save-unattended", "autosave", "unattended"]) {
      const res = await sendAs(app, "POST", `/api/games/${gameId()}/${path}`, started.owner.cookie);
      expect(res.status).toBe(404);
    }
    expect((await gameRow()).status).toBe("active");
  });
});
