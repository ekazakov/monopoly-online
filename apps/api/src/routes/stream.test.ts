import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
// The app (and with it `@hono/zod-openapi`) loads before `@monopoly/shared`, as the zod extension needs.
import { createApp } from "../app.ts";
import { postJson, sendAs, signIn } from "../auth/test-helpers.ts";
import {
  RESUME_MAX_GAP,
  apiErrorSchema,
  gameResponseSchema,
  gameStateResponseSchema,
} from "@monopoly/shared";
import type { Game } from "@monopoly/shared";
import type { Kysely } from "kysely";
import { createDb } from "../db/client.ts";
import { migrateToLatest } from "../db/migrations.ts";
import type { Database } from "../db/schema.ts";
import { createGameStateLoader } from "../game/loader.ts";
import type { GameStateLoader } from "../game/loader.ts";
import { redactState } from "../game/redact.ts";
import { createGameService } from "../game/service.ts";
import { playGame } from "../game/test-helpers.ts";
import type { Step } from "../game/test-helpers.ts";
import { createBus } from "../realtime/bus.ts";
import { createPresenceTracker } from "../realtime/presence.ts";
import type { PresenceTracker } from "../realtime/presence.ts";
import { gameTopic } from "../realtime/messages.ts";
import type { StreamEnvelope } from "../realtime/messages.ts";
import { readSse, startedGame, submitStep } from "../realtime/test-helpers.ts";
import type { SseFrame, SseReader, StartedGame } from "../realtime/test-helpers.ts";
import type { AppOptions } from "../app.ts";

const SEED = 2;
const MISSING_ID = "00000000-0000-4000-8000-0000000000aa";

describe("GET /api/stream", () => {
  let db: Kysely<Database>;
  let app: ReturnType<typeof createApp>;
  let bus: ReturnType<typeof createBus<StreamEnvelope>>;
  let loader: GameStateLoader;
  let readers: SseReader[];
  // Set by a test to run once, inside the next state read of the stream handshake.
  let onLoad: (() => void) | null;

  async function build(options: AppOptions = {}) {
    db = createDb(":memory:");
    await migrateToLatest(db);
    bus = createBus<StreamEnvelope>();
    const real = createGameStateLoader(db);
    loader = {
      ...real,
      async load(gameId) {
        const state = await real.load(gameId);
        const hook = onLoad;
        onLoad = null;
        hook?.();
        return state;
      },
    };
    app = createApp(db, { auth: { guest: true }, seed: () => SEED, bus, loader, ...options });
  }

  beforeEach(async () => {
    readers = [];
    onLoad = null;
    await build();
  });

  afterEach(async () => {
    await Promise.all(readers.map((reader) => reader.close()));
    await db.destroy();
  });

  /** Open the stream and read its frames. */
  async function connect(
    cookie: string,
    gameId: string,
    headers: Record<string, string> = {},
    lastEventId?: string,
  ): Promise<SseReader> {
    const cursor =
      lastEventId === undefined ? "" : `&lastEventId=${encodeURIComponent(lastEventId)}`;
    const res = await app.request(`/api/stream?topics=game:${gameId}${cursor}`, {
      headers: { cookie, ...headers },
    });
    expect(res.status).toBe(200);
    const reader = readSse(res);
    readers.push(reader);
    return reader;
  }

  const errorCode = async (res: Response) => apiErrorSchema.parse(await res.json()).error.code;
  const open = (cookie: string | undefined, query: string) =>
    app.request(`/api/stream${query}`, { headers: cookie ? { cookie } : {} });

  async function createRoom(owner: { cookie: string }) {
    const res = await postJson(app, "/api/games", owner.cookie, { name: "Harbor" });
    return gameResponseSchema.parse(await res.json()).game;
  }

  /** The scripted steps of the game, the first `count` of them. */
  const script = (started: StartedGame, count: number) =>
    playGame(SEED, count, started.initial).steps;

  async function play(started: StartedGame, steps: Step[]) {
    for (const step of steps) {
      const res = await submitStep(app, started, step);
      expect(res.status).toBe(200);
    }
  }

  /** The `game.actions` frame the stream must show for a step. */
  const actionsFrame = (started: StartedGame, step: Step) => ({
    event: "game.actions",
    id: String(step.state.version),
    message: {
      topic: gameTopic(started.game.id),
      type: "game.actions",
      version: step.state.version,
      payload: { events: JSON.parse(JSON.stringify(step.events)), state: redactState(step.state) },
    },
  });

  describe("request errors", () => {
    test("needs the session", async () => {
      const res = await open(undefined, `?topics=game:${MISSING_ID}`);
      expect(res.status).toBe(401);
      expect(await errorCode(res)).toBe("unauthorized");
    });

    test.each([
      ["no topics", ""],
      ["an empty topics value", "?topics="],
      ["a negative resume cursor", `?topics=game:${MISSING_ID}&lastEventId=-1`],
      ["a fractional resume cursor", `?topics=game:${MISSING_ID}&lastEventId=1.5`],
      ["an oversized resume cursor", `?topics=game:${MISSING_ID}&lastEventId=1234567890123456`],
      ["a topic that is not a game", "?topics=user:1"],
      ["a game id that is not a uuid", "?topics=game:abc"],
      ["an empty item in the list", `?topics=game:${MISSING_ID},`],
      [
        "more than five topics",
        `?topics=${Array.from({ length: 6 }, () => `game:${randomUUID()}`).join(",")}`,
      ],
    ])("refuses %s with 400 validation_error", async (_name, query) => {
      const { cookie } = await signIn(app, "Alice");
      const res = await open(cookie, query);
      expect(res.status).toBe(400);
      expect(await errorCode(res)).toBe("validation_error");
    });

    test("answers 404 for an unknown game", async () => {
      const { cookie } = await signIn(app, "Alice");
      const res = await open(cookie, `?topics=game:${MISSING_ID}`);
      expect(res.status).toBe(404);
      expect(await errorCode(res)).toBe("not_found");
    });

    test("answers 403 not_a_member for a user without a seat, also when one topic is fine", async () => {
      const owner = await signIn(app, "Alice");
      const stranger = await signIn(app, "Stranger");
      const game = await createRoom(owner);
      const other = await createRoom(stranger);

      const res = await open(stranger.cookie, `?topics=game:${other.id},game:${game.id}`);
      expect(res.status).toBe(403);
      expect(await errorCode(res)).toBe("not_a_member");
      expect(bus.subscriberCount(gameTopic(game.id))).toBe(0);
      expect(bus.subscriberCount(gameTopic(other.id))).toBe(0);
    });

    test("a request error opens no subscription", async () => {
      const owner = await signIn(app, "Alice");
      const game = await createRoom(owner);
      const res = await open(owner.cookie, `?topics=game:${game.id},game:${MISSING_ID}`);
      expect(res.status).toBe(404);
      expect(bus.subscriberCount(gameTopic(game.id))).toBe(0);
    });
  });

  describe("a waiting room", () => {
    test("connects with a snapshot without state and without an id", async () => {
      const owner = await signIn(app, "Alice");
      const game = await createRoom(owner);
      const res = await app.request(`/api/stream?topics=game:${game.id}`, {
        headers: { cookie: owner.cookie },
      });
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      expect(res.headers.get("cache-control")).toBe("no-cache");
      expect(res.headers.get("x-accel-buffering")).toBe("no");
      const reader = readSse(res);
      readers.push(reader);

      const frame = await reader.next();
      expect(frame.event).toBe("snapshot");
      expect(frame.id).toBeUndefined();
      expect(frame.message).toEqual({
        topic: gameTopic(game.id),
        type: "snapshot",
        version: 0,
        payload: { game, state: null },
      });
      await reader.expectQuiet();
    });

    test("sends room.updated without an id on join, seat add, seat remove and leave", async () => {
      const owner = await signIn(app, "Alice");
      const guest = await signIn(app, "Bobby");
      const game = await createRoom(owner);
      const reader = await connect(owner.cookie, game.id);
      await reader.next();

      const changes: Array<() => Promise<Response> | Response> = [
        () => sendAs(app, "POST", `/api/games/${game.id}/join`, guest.cookie),
        () => postJson(app, `/api/games/${game.id}/seats`, owner.cookie, { name: "Carol" }),
        () => sendAs(app, "POST", `/api/games/${game.id}/leave`, guest.cookie),
      ];
      let latest: Game = game;
      for (const change of changes) {
        const res = await change();
        latest = gameResponseSchema.parse(await res.json()).game;
        const frame = await reader.next();
        expect(frame.event).toBe("room.updated");
        expect(frame.id).toBeUndefined();
        expect(frame.message).toEqual({
          topic: gameTopic(game.id),
          type: "room.updated",
          version: 0,
          payload: { game: latest },
        });
      }

      const carol = latest.seats.find((seat) => seat.name === "Carol")!;
      await sendAs(app, "DELETE", `/api/games/${game.id}/seats/${carol.id}`, owner.cookie);
      const frame = await reader.next();
      expect(frame.event).toBe("room.updated");
      expect(frame.message.payload).toMatchObject({ game: { seats: [{ name: "Alice" }] } });
      await reader.expectQuiet();
    });

    test("start sends a snapshot with the version 0 state and id 0", async () => {
      const owner = await signIn(app, "Alice");
      const guest = await signIn(app, "Bobby");
      const game = await createRoom(owner);
      await sendAs(app, "POST", `/api/games/${game.id}/join`, guest.cookie);
      const reader = await connect(guest.cookie, game.id);
      await reader.next();
      await reader.next().catch(() => {});

      const res = await sendAs(app, "POST", `/api/games/${game.id}/start`, owner.cookie);
      const started = (await res.json()) as { game: Game; state: unknown };
      const frame = await reader.next();
      expect(frame.event).toBe("snapshot");
      expect(frame.id).toBe("0");
      expect(frame.message).toEqual({
        topic: gameTopic(game.id),
        type: "snapshot",
        version: 0,
        payload: { game: started.game, state: started.state },
      });
      expect(started.game.status).toBe("active");
    });

    test("a reconnect with Last-Event-ID while waiting gets a snapshot", async () => {
      const owner = await signIn(app, "Alice");
      const game = await createRoom(owner);
      const reader = await connect(owner.cookie, game.id, { "last-event-id": "0" });
      const frame = await reader.next();
      expect(frame.event).toBe("snapshot");
      expect(frame.id).toBeUndefined();
      expect(frame.message.payload).toMatchObject({ state: null });
    });
  });

  describe("presence", () => {
    let started: StartedGame;
    let tracker: PresenceTracker;
    // The grace timers, run by hand.
    let timers: (() => void)[];
    let seat: Record<string, string>;

    beforeEach(async () => {
      await db.destroy();
      timers = [];
      tracker = createPresenceTracker({
        graceMs: 60_000,
        timers: {
          set: (callback) => timers.push(callback),
          clear: () => {},
        },
      });
      await build({ presence: tracker });
      started = await startedGame(app, SEED);
      seat = Object.fromEntries(started.game.seats.map((s) => [s.name, s.id]));
    });

    afterEach(() => tracker.close());

    const seatsOf = (frame: SseFrame) =>
      (frame.message as { payload: { seats: Record<string, string> } }).payload.seats;
    /** Read presence frames until the seat has the status. Every stream also gets its own connect. */
    async function untilSeat(reader: SseReader, seatId: string, status: string) {
      for (let i = 0; i < 10; i++) {
        const seats = seatsOf(await reader.nextPresence());
        if (seats[seatId] === status) return seats;
      }
      throw new Error(`Seat ${seatId} never became ${status}`);
    }
    const runGrace = async () => {
      for (const fire of timers.splice(0)) fire();
      // The publish reads the seats from the database first.
      await new Promise((resolve) => setTimeout(resolve, 30));
    };

    test("a connect gets the seat map of the controllers it knows, after the snapshot", async () => {
      const reader = await connect(started.owner.cookie, started.game.id);
      expect((await reader.next()).event).toBe("snapshot");
      const frame = await reader.nextPresence();
      expect(frame).toMatchObject({
        event: "presence.updated",
        id: undefined,
        message: { topic: `game:${started.game.id}`, version: 0 },
      });
      // Alice controls her own seat and the hot-seat Carol. Bobby has not arrived yet.
      expect(seatsOf(frame)).toEqual({
        [seat.Alice!]: "online",
        [seat.Bobby!]: "reconnecting",
        [seat.Carol!]: "online",
      });
    });

    test("another player connecting is sent to the first one, and a close is too", async () => {
      const owner = await connect(started.owner.cookie, started.game.id);
      await owner.nextPresence();

      const guest = await connect(started.guest.cookie, started.game.id);
      expect(seatsOf(await guest.nextPresence())).toEqual({
        [seat.Alice!]: "online",
        [seat.Bobby!]: "online",
        [seat.Carol!]: "online",
      });
      await untilSeat(owner, seat.Bobby!, "online");

      await guest.close();
      await untilSeat(owner, seat.Bobby!, "reconnecting");
      await runGrace();
      await untilSeat(owner, seat.Bobby!, "away");
    });

    test("a return within the grace time is online again", async () => {
      const owner = await connect(started.owner.cookie, started.game.id);
      await owner.nextPresence();
      const guest = await connect(started.guest.cookie, started.game.id);
      await untilSeat(owner, seat.Bobby!, "online");
      await guest.close();
      await untilSeat(owner, seat.Bobby!, "reconnecting");

      await connect(started.guest.cookie, started.game.id);
      await untilSeat(owner, seat.Bobby!, "online");
      await runGrace();
      await new Promise((resolve) => setTimeout(resolve, 50));
      // The timer fired late and found a stream: nobody is told that Bobby is away.
      expect(owner.presence.every((f) => seatsOf(f)[seat.Bobby!] === "online")).toBe(true);
      expect(tracker.status(started.game.id, started.guest.user.id)).toBe("online");
    });

    test("two tabs: the first one closing changes nothing", async () => {
      const owner = await connect(started.owner.cookie, started.game.id);
      await owner.nextPresence();
      const tabOne = await connect(started.guest.cookie, started.game.id);
      await connect(started.guest.cookie, started.game.id);
      await untilSeat(owner, seat.Bobby!, "online");

      await tabOne.close();
      await new Promise((resolve) => setTimeout(resolve, 50));
      // Bobby never leaves online, so no frame can show another status for him.
      expect(owner.presence.every((f) => seatsOf(f)[seat.Bobby!] === "online")).toBe(true);
      expect(tracker.status(started.game.id, started.guest.user.id)).toBe("online");
    });

    test("a resume with nothing to send still gets the seat map", async () => {
      await play(started, script(started, 3));
      const reader = await connect(started.owner.cookie, started.game.id, {
        "last-event-id": "3",
      });
      expect(seatsOf(await reader.nextPresence())[seat.Alice!]).toBe("online");
      await reader.expectQuiet(150);
    });

    test("a waiting game, a saved game and a finished game track nobody", async () => {
      const room = await createRoom(started.owner);
      const waiting = await connect(started.owner.cookie, room.id);
      await waiting.next();
      await waiting.expectQuiet();
      expect(waiting.presence).toHaveLength(0);

      await sendAs(app, "POST", `/api/games/${started.game.id}/save`, started.owner.cookie);
      const saved = await connect(started.owner.cookie, started.game.id);
      await saved.next();
      await saved.expectQuiet();
      expect(saved.presence).toHaveLength(0);
      expect(tracker.statuses(started.game.id)).toEqual({});
      expect(tracker.statuses(room.id)).toEqual({});
    });

    test("a closed stream disconnects the user", async () => {
      const reader = await connect(started.owner.cookie, started.game.id);
      await reader.nextPresence();
      expect(tracker.status(started.game.id, started.owner.user.id)).toBe("online");
      await reader.close();
      await waitUntil(
        () => tracker.status(started.game.id, started.owner.user.id) === "reconnecting",
      );
    });
  });

  describe("an active game", () => {
    let started: StartedGame;
    let topic: `game:${string}`;

    beforeEach(async () => {
      started = await startedGame(app, SEED);
      topic = gameTopic(started.game.id);
    });

    test("connects with a snapshot of the current state and its version as id", async () => {
      const steps = script(started, 3);
      await play(started, steps);

      const reader = await connect(started.guest.cookie, started.game.id);
      const frame = await reader.next();
      expect(frame.event).toBe("snapshot");
      expect(frame.id).toBe("3");
      expect(frame.message).toMatchObject({
        topic,
        type: "snapshot",
        version: 3,
        payload: { game: { id: started.game.id, status: "active", version: 3 } },
      });
      expect(frame.message.payload).toMatchObject({ state: redactState(steps[2]!.state) });
      await reader.expectQuiet();
    });

    test("sends game.actions with the version as id, the events and the state after", async () => {
      const reader = await connect(started.owner.cookie, started.game.id);
      expect((await reader.next()).id).toBe("0");

      const steps = script(started, 6);
      await play(started, steps);

      const frames = await reader.take(steps.length);
      expect(frames).toEqual(
        steps.map((step) => expect.objectContaining(actionsFrame(started, step))),
      );
      expect(frames.map((frame) => frame.id)).toEqual(["1", "2", "3", "4", "5", "6"]);
    });

    test("never sends rng or decks", async () => {
      const reader = await connect(started.owner.cookie, started.game.id);
      await play(started, script(started, 3));
      const frames = [await reader.next(), ...(await reader.take(3))];
      for (const frame of frames) {
        const payload = frame.message.payload as { state: Record<string, unknown> };
        expect(payload.state).not.toHaveProperty("rng");
        expect(payload.state).not.toHaveProperty("decks");
        expect(JSON.stringify(frame.message)).not.toMatch(/"(rng|decks)"/);
      }
    });

    test("two subscribers get the same frames", async () => {
      const first = await connect(started.owner.cookie, started.game.id);
      const second = await connect(started.guest.cookie, started.game.id);
      await first.next();
      await second.next();

      const steps = script(started, 4);
      await play(started, steps);
      const [a, b] = await Promise.all([first.take(4), second.take(4)]);
      expect(a).toEqual(b);
      expect(a.map((frame) => frame.id)).toEqual(["1", "2", "3", "4"]);
    });

    test("a seat-less user is refused, a hot-seat controller is accepted", async () => {
      const stranger = await signIn(app, "Stranger");
      expect((await open(stranger.cookie, `?topics=game:${started.game.id}`)).status).toBe(403);
      const reader = await connect(started.owner.cookie, started.game.id);
      expect((await reader.next()).event).toBe("snapshot");
    });

    describe("resume with Last-Event-ID", () => {
      test("a new EventSource can replay from a query cursor and then receive live actions", async () => {
        const steps = script(started, 9);
        await play(started, steps.slice(0, 8));
        const resumed = await connect(started.owner.cookie, started.game.id, {}, "3");
        expect(await resumed.take(5)).toEqual(
          steps.slice(3, 8).map((step) => expect.objectContaining(actionsFrame(started, step))),
        );
        await play(started, steps.slice(8));
        expect((await resumed.next()).id).toBe("9");
      });

      test("the native header takes precedence over an older query cursor", async () => {
        await play(started, script(started, 8));
        const resumed = await connect(
          started.owner.cookie,
          started.game.id,
          { "last-event-id": "5" },
          "2",
        );
        expect((await resumed.take(3)).map((frame) => frame.id)).toEqual(["6", "7", "8"]);
        await resumed.expectQuiet();
      });

      test("replays exactly the missed frames, in order", async () => {
        const live = await connect(started.owner.cookie, started.game.id);
        await live.next();
        const steps = script(started, 8);
        await play(started, steps);
        const seen = await live.take(8);

        const resumed = await connect(started.owner.cookie, started.game.id, {
          "last-event-id": "3",
        });
        const frames = await resumed.take(5);
        expect(frames.map((frame) => frame.id)).toEqual(["4", "5", "6", "7", "8"]);
        expect(frames).toEqual(seen.slice(3));
        await resumed.expectQuiet();
      });

      test("replays one frame for a gap of 1, from the start state too", async () => {
        await play(started, script(started, 2));
        const one = await connect(started.owner.cookie, started.game.id, { "last-event-id": "1" });
        expect((await one.next()).id).toBe("2");
        await one.expectQuiet();

        const all = await connect(started.owner.cookie, started.game.id, { "last-event-id": "0" });
        expect((await all.take(2)).map((frame) => frame.id)).toEqual(["1", "2"]);
      });

      test("replays across a stored snapshot and keeps going with live frames", async () => {
        // The turn changes during the script, so snapshots exist between the versions.
        const steps = script(started, 30);
        await play(started, steps.slice(0, 20));
        const reader = await connect(started.owner.cookie, started.game.id, {
          "last-event-id": "2",
        });
        const replayed = await reader.take(18);
        expect(replayed.map((frame) => frame.id)).toEqual(
          Array.from({ length: 18 }, (_, i) => String(i + 3)),
        );
        expect(replayed).toEqual(
          steps.slice(2, 20).map((step) => expect.objectContaining(actionsFrame(started, step))),
        );

        await play(started, steps.slice(20, 22));
        expect((await reader.take(2)).map((frame) => frame.id)).toEqual(["21", "22"]);
      });

      test("a Last-Event-ID from before a rollback gets a snapshot and no error log", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
          await play(started, script(started, 8));
          const turnStart = await db
            .selectFrom("game_snapshots")
            .select("version")
            .where("turn_start", "=", 1)
            .orderBy("version", "desc")
            .executeTakeFirstOrThrow();
          expect(turnStart.version).toBeLessThan(8);
          // Save, then Restore (C5): the discarded turn leaves a hole in the log.
          await createGameService({ db, loader }).rollbackToTurnStart({
            gameId: started.game.id,
            status: "saved",
          });
          await db
            .updateTable("games")
            .set({ status: "active" })
            .where("id", "=", started.game.id)
            .execute();

          const reader = await connect(started.owner.cookie, started.game.id, {
            "last-event-id": "8",
          });
          const frame = await reader.next();
          expect(frame.event).toBe("snapshot");
          expect(frame.id).toBe("9");
          expect(log).not.toHaveBeenCalled();
        } finally {
          log.mockRestore();
        }
      });

      describe("Save, Restore and Finish", () => {
        const post = (action: string) =>
          sendAs(app, "POST", `/api/games/${started.game.id}/${action}`, started.owner.cookie);

        test("a live stream gets a snapshot for each of them", async () => {
          await play(started, script(started, 8));
          const live = await connect(started.owner.cookie, started.game.id);
          await live.next();

          expect((await post("save")).status).toBe(200);
          const saved = await live.next();
          expect(saved).toMatchObject({ event: "snapshot", id: "9" });
          expect(saved.message).toMatchObject({
            payload: { game: { status: "saved", version: 9 } },
          });

          expect((await post("restore")).status).toBe(200);
          const restored = await live.next();
          expect(restored).toMatchObject({ event: "snapshot", id: "9" });
          expect(restored.message).toMatchObject({
            payload: { game: { status: "active", version: 9 } },
          });

          expect((await post("finish")).status).toBe(200);
          const finished = await live.next();
          expect(finished.event).toBe("snapshot");
          expect(finished.message).toMatchObject({ payload: { game: { status: "finished" } } });
          await live.expectQuiet();
        });

        test("a reconnect with an old Last-Event-ID gets a snapshot, with no error log", async () => {
          const log = vi.spyOn(console, "error").mockImplementation(() => {});
          try {
            await play(started, script(started, 8));
            // The owner has the game open, so the restore finds somebody online.
            await connect(started.owner.cookie, started.game.id);
            expect((await post("save")).status).toBe(200);
            expect((await post("restore")).status).toBe(200);
            const reader = await connect(started.owner.cookie, started.game.id, {
              "last-event-id": "8",
            });
            expect(await reader.next()).toMatchObject({ event: "snapshot", id: "9" });
            await reader.expectQuiet();
            expect(log).not.toHaveBeenCalled();
          } finally {
            log.mockRestore();
          }
        });

        test("a reconnect to a saved game gets a snapshot with the saved status", async () => {
          await play(started, script(started, 8));
          expect((await post("save")).status).toBe(200);
          const reader = await connect(started.guest.cookie, started.game.id, {
            "last-event-id": "8",
          });
          const frame = await reader.next();
          expect(frame).toMatchObject({ event: "snapshot", id: "9" });
          expect(frame.message).toMatchObject({ payload: { game: { status: "saved" } } });
        });
      });

      test("sends nothing for a gap of 0", async () => {
        await play(started, script(started, 3));
        const reader = await connect(started.owner.cookie, started.game.id, {
          "last-event-id": "3",
        });
        await reader.expectQuiet(150);
        await reader.waitForComments(1);

        const steps = script(started, 4);
        await play(started, steps.slice(3));
        const frame = await reader.next();
        expect(frame.id).toBe("4");
        expect(frame.event).toBe("game.actions");
      });

      test.each([
        ["a future id", "99"],
        ["a negative id", "-1"],
        ["text", "abc"],
        ["a fraction", "1.5"],
        ["an empty id", ""],
      ])("sends a snapshot for %s", async (_name, id) => {
        await play(started, script(started, 3));
        const reader = await connect(started.owner.cookie, started.game.id, {
          "last-event-id": id,
        });
        const frame = await reader.next();
        expect(frame.event).toBe("snapshot");
        expect(frame.id).toBe("3");
        await reader.expectQuiet();
      });

      test("sends a snapshot when the gap is above the limit", async () => {
        await build({ resumeMaxGap: 3 });
        started = await startedGame(app, SEED);
        topic = gameTopic(started.game.id);
        const steps = script(started, 6);
        await play(started, steps);

        const inside = await connect(started.owner.cookie, started.game.id, {
          "last-event-id": "3",
        });
        expect((await inside.take(3)).map((frame) => frame.event)).toEqual([
          "game.actions",
          "game.actions",
          "game.actions",
        ]);

        const outside = await connect(started.owner.cookie, started.game.id, {
          "last-event-id": "2",
        });
        const frame = await outside.next();
        expect(frame.event).toBe("snapshot");
        expect(frame.id).toBe("6");
        expect(frame.message.payload).toMatchObject({ state: redactState(steps[5]!.state) });
        await outside.expectQuiet();
      });

      test(`uses ${RESUME_MAX_GAP} versions as the default limit`, async () => {
        const steps = script(started, RESUME_MAX_GAP + 2);
        expect(steps.length).toBe(RESUME_MAX_GAP + 2);
        await play(started, steps);

        const edge = await connect(started.owner.cookie, started.game.id, {
          "last-event-id": "2",
        });
        const replayed = await edge.take(RESUME_MAX_GAP);
        expect(replayed[0]!.id).toBe("3");
        expect(replayed.at(-1)!.id).toBe(String(RESUME_MAX_GAP + 2));
        await edge.expectQuiet();

        const over = await connect(started.owner.cookie, started.game.id, {
          "last-event-id": "1",
        });
        expect((await over.next()).event).toBe("snapshot");
      });

      test("gives every topic a snapshot when the stream has several topics", async () => {
        const other = await createRoom(started.owner);
        await play(started, script(started, 2));
        const res = await app.request(
          `/api/stream?topics=game:${started.game.id},game:${other.id}`,
          { headers: { cookie: started.owner.cookie, "last-event-id": "1" } },
        );
        const reader = readSse(res);
        readers.push(reader);
        const frames = await reader.take(2);
        expect(frames.map((frame) => [frame.message.topic, frame.event, frame.id])).toEqual([
          [gameTopic(started.game.id), "snapshot", "2"],
          [gameTopic(other.id), "snapshot", undefined],
        ]);
      });
    });

    describe("a finished game", () => {
      async function finish() {
        const [, second, third] = started.game.seats;
        let version = 0;
        for (const seat of [second!, third!]) {
          const res = await postJson(
            app,
            `/api/games/${started.game.id}/actions`,
            started.cookieOfSeat(seat.id),
            {
              seatId: seat.id,
              action: { type: "Resign" },
              expectedVersion: version,
              clientActionId: randomUUID(),
            },
          );
          expect(res.status).toBe(200);
          version = ((await res.json()) as { version: number }).version;
        }
        return version;
      }

      test("connects with a snapshot of the final state, also after a resume id", async () => {
        const final = await finish();
        const variants: Array<Record<string, string>> = [
          {},
          { "last-event-id": String(final) },
          { "last-event-id": "0" },
        ];
        for (const headers of variants) {
          const reader = await connect(started.owner.cookie, started.game.id, headers);
          const frame = await reader.next();
          expect(frame.event).toBe("snapshot");
          expect(frame.id).toBe(String(final));
          expect(frame.message.payload).toMatchObject({
            game: { status: "finished", version: final },
            state: { version: final, turn: { phase: "game_over" } },
          });
          await reader.expectQuiet();
        }
      });

      test("the action that ends the game is sent as game.actions with GameEnded", async () => {
        const reader = await connect(started.owner.cookie, started.game.id);
        await reader.next();
        const final = await finish();
        const frames = await reader.take(final);
        const last = frames.at(-1)!;
        expect(last.event).toBe("game.actions");
        expect(last.id).toBe(String(final));
        expect(JSON.stringify(last.message.payload)).toContain("GameEnded");
      });
    });

    describe("the connection", () => {
      test("sends a heartbeat comment at the set interval", async () => {
        await build({ heartbeatMs: 20 });
        started = await startedGame(app, SEED);
        const reader = await connect(started.owner.cookie, started.game.id);
        await reader.next();
        await reader.waitForComments(3);
        expect(
          reader.comments.filter((comment) => comment === "heartbeat").length,
        ).toBeGreaterThanOrEqual(2);
        expect(reader.pending).toEqual([]);
      });

      test("unsubscribes and stops the heartbeat when the client disconnects", async () => {
        await build({ heartbeatMs: 20 });
        started = await startedGame(app, SEED);
        topic = gameTopic(started.game.id);
        const first = await connect(started.owner.cookie, started.game.id);
        const second = await connect(started.guest.cookie, started.game.id);
        await first.next();
        await second.next();
        expect(bus.subscriberCount(topic)).toBe(2);

        await first.close();
        await waitUntil(() => bus.subscriberCount(topic) === 1);
        await second.close();
        await waitUntil(() => bus.subscriberCount(topic) === 0);
      });

      test("a message published during the handshake is neither lost nor repeated", async () => {
        const steps = script(started, 3);
        await play(started, steps.slice(0, 1));
        const message = (step: Step): StreamEnvelope => ({
          topic,
          type: "game.actions",
          version: step.state.version,
          payload: {
            events: step.events as never,
            state: redactState(step.state),
          },
        });
        onLoad = () => {
          // Version 1 is already in the snapshot. Version 2 is new.
          bus.publish(topic, message(steps[0]!));
          bus.publish(topic, message(steps[1]!));
          bus.publish(topic, message(steps[1]!));
        };

        const reader = await connect(started.owner.cookie, started.game.id);
        const [snapshot, next] = await reader.take(2);
        expect(snapshot!.event).toBe("snapshot");
        expect(snapshot!.id).toBe("1");
        expect(next).toEqual(expect.objectContaining(actionsFrame(started, steps[1]!)));
        await reader.expectQuiet();

        // The same version again, once live, is dropped too.
        bus.publish(topic, message(steps[1]!));
        bus.publish(topic, message(steps[2]!));
        expect((await reader.next()).id).toBe("3");
        await reader.expectQuiet();
      });

      test("actions that commit while the stream opens give one gapless sequence", async () => {
        const steps = script(started, 12);
        const reader = await connect(started.owner.cookie, started.game.id);
        await reader.next();
        const racing: Array<Promise<SseReader>> = [];
        for (const [index, step] of steps.entries()) {
          await play(started, [step]);
          // Open a stream now and then, while later actions are still to come.
          if (index % 4 === 0) racing.push(connect(started.guest.cookie, started.game.id));
        }
        for (const racer of await Promise.all(racing)) {
          const frames: SseFrame[] = [await racer.next()];
          while (Number(frames.at(-1)!.id) < steps.length) frames.push(await racer.next());
          const versions = frames.map((frame) => frame.message.version);
          expect(versions).toEqual([...versions].sort((a, b) => a - b));
          expect(new Set(versions).size).toBe(versions.length);
          expect(versions.at(-1)).toBe(steps.length);
          await racer.expectQuiet();
        }
      });

      test("a failing bus handler or a throwing room listener does not stop the stream", async () => {
        const reader = await connect(started.owner.cookie, started.game.id);
        await reader.next();
        bus.subscribe(topic, () => {
          throw new Error("other subscriber");
        });
        await play(started, script(started, 1));
        expect((await reader.next()).id).toBe("1");
      });
    });
  });

  describe("GET /api/games/:id/state through the app", () => {
    test("needs the session", async () => {
      const res = await sendAs(app, "GET", `/api/games/${MISSING_ID}/state`);
      expect(res.status).toBe(401);
      expect(await errorCode(res)).toBe("unauthorized");
    });

    test("action submission needs the session too", async () => {
      const res = await postJson(app, `/api/games/${MISSING_ID}/actions`, undefined, {});
      expect(res.status).toBe(401);
    });

    test("answers 404 for an unknown game", async () => {
      const { cookie } = await signIn(app, "Alice");
      const res = await sendAs(app, "GET", `/api/games/${MISSING_ID}/state`, cookie);
      expect(res.status).toBe(404);
      expect(await errorCode(res)).toBe("not_found");
    });

    test("answers 409 game_not_active while the game waits", async () => {
      const owner = await signIn(app, "Alice");
      const game = await createRoom(owner);
      const res = await sendAs(app, "GET", `/api/games/${game.id}/state`, owner.cookie);
      expect(res.status).toBe(409);
      expect(await errorCode(res)).toBe("game_not_active");
    });

    test("answers 403 not_a_member for a user without a seat", async () => {
      const started = await startedGame(app, SEED);
      const stranger = await signIn(app, "Stranger");
      const res = await sendAs(app, "GET", `/api/games/${started.game.id}/state`, stranger.cookie);
      expect(res.status).toBe(403);
      expect(await errorCode(res)).toBe("not_a_member");
    });

    test("reads the redacted state of an active game, for every seated user", async () => {
      const started = await startedGame(app, SEED);
      const steps = script(started, 4);
      await play(started, steps);

      for (const who of [started.owner, started.guest]) {
        const res = await sendAs(app, "GET", `/api/games/${started.game.id}/state`, who.cookie);
        expect(res.status).toBe(200);
        const body = gameStateResponseSchema.parse(await res.json());
        expect(body).toEqual({ version: 4, state: redactState(steps[3]!.state) });
        expect(Object.keys(body.state)).not.toContain("rng");
        expect(Object.keys(body.state)).not.toContain("decks");
      }
    });

    test("a finished game keeps its state readable and refuses actions", async () => {
      const started = await startedGame(app, SEED);
      const [, second, third] = started.game.seats;
      let version = 0;
      for (const seat of [second!, third!]) {
        const res = await postJson(
          app,
          `/api/games/${started.game.id}/actions`,
          started.cookieOfSeat(seat.id),
          {
            seatId: seat.id,
            action: { type: "Resign" },
            expectedVersion: version,
            clientActionId: randomUUID(),
          },
        );
        version = ((await res.json()) as { version: number }).version;
      }

      const res = await sendAs(
        app,
        "GET",
        `/api/games/${started.game.id}/state`,
        started.guest.cookie,
      );
      expect(res.status).toBe(200);
      const body = gameStateResponseSchema.parse(await res.json());
      expect(body.version).toBe(version);
      expect(body.state.turn.phase).toBe("game_over");

      const after = await postJson(
        app,
        `/api/games/${started.game.id}/actions`,
        started.owner.cookie,
        {
          seatId: started.game.seats[0]!.id,
          action: { type: "RollDice" },
          expectedVersion: version,
          clientActionId: randomUUID(),
        },
      );
      expect(after.status).toBe(409);
      expect(await errorCode(after)).toBe("game_not_active");
    });
  });
});

/** Poll until `condition` holds, or fail after `timeoutMs`. */
async function waitUntil(condition: () => boolean, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("Condition not met in time");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
