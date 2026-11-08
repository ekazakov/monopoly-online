import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
// The app (and with it `@hono/zod-openapi`) loads before `@monopoly/shared`, as the zod extension needs.
import { createApp } from "./app.ts";
import { signIn } from "./auth/test-helpers.ts";
import type { Kysely } from "kysely";
import { createDb } from "./db/client.ts";
import { migrateToLatest } from "./db/migrations.ts";
import { createQueryObserver } from "./db/query-telemetry.ts";
import type { Database } from "./db/schema.ts";
import { playGame } from "./game/test-helpers.ts";
import { registerProcessMetrics } from "./metrics.ts";
import { createTestMeter, pointValue } from "./metrics-test-helpers.ts";
import { createPresenceTracker } from "./realtime/presence.ts";
import type { PresenceTracker } from "./realtime/presence.ts";
import { readSse, startedGame, submitStep } from "./realtime/test-helpers.ts";

const SEED = 2;

describe("metrics", () => {
  let test_: ReturnType<typeof createTestMeter>;
  let db: Kysely<Database>;
  let app: ReturnType<typeof createApp>;
  let tracker: PresenceTracker;
  // The grace timers, run by hand.
  let timers: { callback: () => void; live: boolean }[];

  beforeEach(async () => {
    test_ = createTestMeter();
    timers = [];
    tracker = createPresenceTracker({
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
    db = createDb(":memory:", { log: createQueryObserver(test_.meter) });
    await migrateToLatest(db);
    app = createApp(db, {
      auth: { guest: true },
      seed: () => SEED,
      meter: test_.meter,
      presence: tracker,
    });
  });

  afterEach(async () => {
    tracker.close();
    await db.destroy();
    await test_.shutdown();
  });

  describe("HTTP", () => {
    test("each request goes in the duration histogram by method, route template and status", async () => {
      const { cookie } = await signIn(app, "Ada");
      const id = crypto.randomUUID();
      await app.request(`/api/games/${id}`, { headers: { cookie } });
      await app.request(`/api/games/${crypto.randomUUID()}`, { headers: { cookie } });

      const points = (await test_.collect())["http.server.request.duration"];
      const notFound = pointValue(points, {
        "http.request.method": "GET",
        "http.route": "/api/games/:id",
        "http.response.status_code": 404,
      }) as { count: number; sum: number };
      expect(notFound.count).toBe(2);
      expect(notFound.sum).toBeGreaterThan(0);
      expect(pointValue(points, { "http.route": "/api/session" })).toMatchObject({ count: 1 });
      // No raw path in any label.
      expect(JSON.stringify(points)).not.toContain(id);
    });
  });

  describe("realtime", () => {
    test("open streams, connected devices and reconnects", async () => {
      const { cookie } = await signIn(app, "Ada");
      const other = await signIn(app, "Bobby");
      const open = async (who: string, headers: Record<string, string> = {}) => {
        const res = await app.request("/api/stream?topics=lobby", {
          headers: { cookie: who, ...headers },
        });
        const reader = readSse(res);
        await reader.take(1);
        return reader;
      };
      const read = async () => {
        const all = await test_.collect();
        return {
          streams: pointValue(all["harborfront.realtime.streams.open"]),
          devices: pointValue(all["harborfront.realtime.devices.connected"]),
          reconnects: pointValue(all["harborfront.realtime.reconnects"]),
        };
      };

      // Two tabs of Ada and one of Bobby: three streams, two devices.
      const a1 = await open(cookie);
      const a2 = await open(cookie, { "last-event-id": "3" });
      const b1 = await open(other.cookie);
      expect(await read()).toEqual({ streams: 3, devices: 2, reconnects: 1 });

      await a1.close();
      await expect.poll(async () => (await read()).streams).toBe(2);
      // Ada still has a tab.
      expect((await read()).devices).toBe(2);
      await a2.close();
      await expect.poll(async () => (await read()).devices).toBe(1);
      await b1.close();
      await expect.poll(async () => (await read()).streams).toBe(0);
      expect((await read()).devices).toBe(0);
    });

    test("a reconnect counts by what it got", async () => {
      const started = await startedGame(app, SEED);
      for (const step of playGame(SEED, 4, started.initial).steps) {
        expect((await submitStep(app, started, step)).status).toBe(200);
      }
      const topic = `game:${started.game.id}`;
      const reconnect = async (lastEventId: string) => {
        const res = await app.request(`/api/stream?topics=${topic}`, {
          headers: { cookie: started.owner.cookie, "last-event-id": lastEventId },
        });
        const reader = readSse(res);
        // A resume with nothing missed sends no frame, so wait a moment and not for a frame.
        await new Promise((resolve) => setTimeout(resolve, 50));
        await reader.close();
      };
      await reconnect("1"); // 3 missed events
      await reconnect("4"); // nothing missed
      await reconnect("99"); // not a version of this game
      // A first connect is not a resume.
      const first = readSse(
        await app.request(`/api/stream?topics=${topic}`, {
          headers: { cookie: started.owner.cookie },
        }),
      );
      await first.take(1);
      await first.close();

      const points = (await test_.collect())["harborfront.realtime.resumes"];
      expect(pointValue(points, { kind: "events" })).toBe(1);
      expect(pointValue(points, { kind: "none" })).toBe(1);
      expect(pointValue(points, { kind: "snapshot" })).toBe(1);
    });

    test("the users in each presence state", async () => {
      const started = await startedGame(app, SEED);
      // Alice and Bobby control seats, and start in the grace time.
      let presence = (await test_.collect())["harborfront.realtime.presence"];
      expect(pointValue(presence, { state: "reconnecting" })).toBe(2);
      expect(pointValue(presence, { state: "online" })).toBe(0);

      const close = tracker.connect(started.game.id, started.owner.user.id);
      presence = (await test_.collect())["harborfront.realtime.presence"];
      expect(pointValue(presence, { state: "online" })).toBe(1);
      expect(pointValue(presence, { state: "reconnecting" })).toBe(1);
      close();
    });

    test("an automatic save is counted", async () => {
      const started = await startedGame(app, SEED);
      // Nobody has a stream: run the grace timers until every controller is away.
      for (const timer of timers.filter((t) => t.live)) {
        timer.live = false;
        timer.callback();
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      const row = await db
        .selectFrom("games")
        .select("status")
        .where("id", "=", started.game.id)
        .executeTakeFirstOrThrow();
      expect(row.status).toBe("saved");
      const points = (await test_.collect())["harborfront.realtime.autosaves"];
      expect(pointValue(points)).toBe(1);
    });
  });

  describe("database and process", () => {
    test("the query duration has the operation and the table", async () => {
      await signIn(app, "Ada");
      const points = (await test_.collect())["db.client.operation.duration"];
      const insert = pointValue(points, {
        "db.operation.name": "INSERT",
        "db.collection.name": "users",
      }) as { count: number };
      expect(insert.count).toBe(1);
      expect(pointValue(points, { "db.operation.name": "BEGIN" })).toBeDefined();
    });

    test("the file size and the memory are gauges", async () => {
      const dir = mkdtempSync(join(tmpdir(), "metrics-"));
      try {
        const file = join(dir, "t.db");
        writeFileSync(file, "x".repeat(1234));
        registerProcessMetrics(test_.meter, { dbPath: file });
        const all = await test_.collect();
        expect(pointValue(all["harborfront.db.file.size"])).toBe(1234);
        expect(pointValue(all["process.memory.usage"]) as number).toBeGreaterThan(0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("a missing file is not reported", async () => {
      registerProcessMetrics(test_.meter, { dbPath: ":memory:" });
      const all = await test_.collect();
      expect(all["harborfront.db.file.size"]).toBeUndefined();
    });
  });
});

describe("presence tracker counts", () => {
  test("sums the statuses of the watched games", () => {
    const tracker = createPresenceTracker({ timers: { set: () => null, clear: () => {} } });
    expect(tracker.counts()).toEqual({ online: 0, reconnecting: 0, away: 0 });
    tracker.watch("g1", ["a", "b", "c"], "reconnecting");
    tracker.watch("g2", ["a"], "away");
    tracker.connect("g1", "a");
    expect(tracker.counts()).toEqual({ online: 1, reconnecting: 2, away: 1 });
    tracker.forget("g2");
    expect(tracker.counts()).toEqual({ online: 1, reconnecting: 2, away: 0 });
    tracker.close();
  });
});
