// One test for each area of "Log events" in plan/milestone-5-tasks.md: game actions, lifecycle,
// presence, auth and the stream resume. Each test reads the lines of a memory logger.
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
// The app (and with it `@hono/zod-openapi`) loads before `@monopoly/shared`, as the zod extension needs.
import { createApp } from "./app.ts";
import { postJson, sendAs, sessionCookieFrom } from "./auth/test-helpers.ts";
import type { Kysely } from "kysely";
import { createDb } from "./db/client.ts";
import { migrateToLatest } from "./db/migrations.ts";
import type { Database } from "./db/schema.ts";
import { playGame } from "./game/test-helpers.ts";
import { createMemoryLogger, type LogLine } from "./log-test-helpers.ts";
import { createPresenceTracker } from "./realtime/presence.ts";
import type { PresenceTracker } from "./realtime/presence.ts";
import { readSse, startedGame, submitStep } from "./realtime/test-helpers.ts";
import type { StartedGame } from "./realtime/test-helpers.ts";

const SEED = 2;

describe("domain log events", () => {
  let db: Kysely<Database>;
  let app: ReturnType<typeof createApp>;
  let lines: LogLine[];
  let tracker: PresenceTracker;

  beforeEach(async () => {
    db = createDb(":memory:");
    await migrateToLatest(db);
    const memory = createMemoryLogger();
    lines = memory.lines;
    tracker = createPresenceTracker({ timers: { set: () => null, clear: () => {} } });
    app = createApp(db, {
      auth: { guest: true },
      seed: () => SEED,
      logger: memory.logger,
      presence: tracker,
    });
  });

  afterEach(async () => {
    tracker.close();
    await db.destroy();
  });

  const named = (msg: string) => lines.filter((line) => line.msg === msg);

  describe("game actions", () => {
    let started: StartedGame;

    beforeEach(async () => {
      started = await startedGame(app, SEED);
      lines.length = 0;
    });

    const send = (
      step: ReturnType<typeof playGame>["steps"][number],
      overrides: { expectedVersion?: number; clientActionId?: string } = {},
    ) => {
      const { playerId, ...action } = step.action;
      return postJson(
        app,
        `/api/games/${started.game.id}/actions`,
        started.cookieOfSeat(playerId),
        {
          seatId: playerId,
          action,
          expectedVersion: overrides.expectedVersion ?? step.state.version - 1,
          clientActionId: overrides.clientActionId ?? randomUUID(),
        },
      );
    };

    test("an applied action, a repeat, a conflict and a refusal", async () => {
      const [first, second] = playGame(SEED, 2, started.initial).steps;
      const clientActionId = randomUUID();

      expect((await send(first!, { clientActionId })).status).toBe(200);
      expect(named("action applied")).toHaveLength(1);
      expect(named("action applied")[0]).toMatchObject({
        level: "info",
        gameId: started.game.id,
        seatId: first!.action.playerId,
        actionType: first!.action.type,
        version: 1,
        clientActionId,
      });
      expect(typeof named("action applied")[0]!.durationMs).toBe("number");

      // The same clientActionId again: the stored result, nothing applied.
      expect((await send(first!, { clientActionId })).status).toBe(200);
      expect(named("action applied")).toHaveLength(1);
      expect(named("action repeated")).toHaveLength(1);
      expect(named("action repeated")[0]).toMatchObject({ clientActionId, version: 1 });

      // A wrong expectedVersion is a conflict, and the line has both versions.
      expect((await send(second!, { expectedVersion: 7 })).status).toBe(409);
      expect(named("action version conflict")[0]).toMatchObject({
        level: "warn",
        expectedVersion: 7,
        currentVersion: 1,
      });

      // The engine refuses a second RollDice in the same phase.
      const again = { ...first!, state: { ...first!.state, version: 2 } };
      expect((await send(again, { expectedVersion: 1 })).status).toBe(422);
      expect(named("action refused")[0]).toMatchObject({
        level: "info",
        actionType: first!.action.type,
      });
      expect(typeof named("action refused")[0]!.errorCode).toBe("string");
    });
  });

  describe("lifecycle", () => {
    test("start, save and restore", async () => {
      const started = await startedGame(app, SEED);
      expect(named("game started")[0]).toMatchObject({
        gameId: started.game.id,
        userId: started.owner.user.id,
        seats: 3,
      });

      tracker.connect(started.game.id, started.owner.user.id);
      tracker.connect(started.game.id, started.guest.user.id);
      lines.length = 0;
      const saved = await sendAs(
        app,
        "POST",
        `/api/games/${started.game.id}/save`,
        started.owner.cookie,
      );
      expect(saved.status).toBe(200);
      expect(named("game saved")[0]).toMatchObject({
        gameId: started.game.id,
        userId: started.owner.user.id,
      });

      const restored = await sendAs(
        app,
        "POST",
        `/api/games/${started.game.id}/restore`,
        started.owner.cookie,
      );
      expect(restored.status).toBe(200);
      expect(named("game restored")[0]).toMatchObject({ gameId: started.game.id });
    });
  });

  describe("presence", () => {
    test("a change of status", async () => {
      const started = await startedGame(app, SEED);
      lines.length = 0;
      tracker.connect(started.game.id, started.owner.user.id);
      expect(named("presence changed")).toEqual([
        expect.objectContaining({
          gameId: started.game.id,
          userId: started.owner.user.id,
          status: "online",
        }),
      ]);
    });
  });

  describe("auth", () => {
    test("sign-in and sign-out, with no token in the lines", async () => {
      const res = await postJson(app, "/api/session", undefined, { name: "Ada" });
      expect(res.status).toBe(201);
      const { user } = (await res.json()) as { user: { id: string } };
      expect(named("signed in")[0]).toMatchObject({ userId: user.id, provider: "guest" });

      const cookie = sessionCookieFrom(res)!;
      expect((await sendAs(app, "DELETE", "/api/session", cookie)).status).toBe(204);
      expect(named("signed out")[0]).toMatchObject({ userId: user.id });

      const token = cookie.split("=")[1]!;
      expect(JSON.stringify(lines)).not.toContain(token);
    });
  });

  describe("stream resume", () => {
    test("with events, and with a snapshot", async () => {
      const started = await startedGame(app, SEED);
      for (const step of playGame(SEED, 4, started.initial).steps) {
        expect((await submitStep(app, started, step)).status).toBe(200);
      }
      lines.length = 0;
      const topic = `game:${started.game.id}`;

      const replay = await app.request(`/api/stream?topics=${topic}`, {
        headers: { cookie: started.owner.cookie, "last-event-id": "1" },
      });
      const replayReader = readSse(replay);
      await replayReader.take(1);
      await replayReader.close();
      expect(named("stream resumed with events")[0]).toMatchObject({
        gameId: started.game.id,
        lastEventId: 1,
        version: 4,
      });

      // A first connect has no Last-Event-ID: it is not a resume.
      const first = readSse(
        await app.request(`/api/stream?topics=${topic}`, {
          headers: { cookie: started.owner.cookie },
        }),
      );
      await first.take(1);
      await first.close();
      expect(named("stream resumed with a snapshot")).toHaveLength(0);

      // The id is not a version of this game: a snapshot.
      const stale = readSse(
        await app.request(`/api/stream?topics=${topic}`, {
          headers: { cookie: started.owner.cookie, "last-event-id": "99" },
        }),
      );
      await stale.take(1);
      await stale.close();
      expect(named("stream resumed with a snapshot")[0]).toMatchObject({
        gameId: started.game.id,
        lastEventId: 99,
        reason: "snapshot",
      });
    });
  });
});
