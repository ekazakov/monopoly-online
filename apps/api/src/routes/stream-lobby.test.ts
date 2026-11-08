import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
// The app (and with it `@hono/zod-openapi`) loads before `@monopoly/shared`, as the zod extension needs.
import { createApp } from "../app.ts";
import { postJson, sendAs, signIn } from "../auth/test-helpers.ts";
import { apiErrorSchema, gameResponseSchema } from "@monopoly/shared";
import type { Game } from "@monopoly/shared";
import type { Kysely } from "kysely";
import { createDb } from "../db/client.ts";
import { migrateToLatest } from "../db/migrations.ts";
import type { Database } from "../db/schema.ts";
import { createBus } from "../realtime/bus.ts";
import type { StreamEnvelope } from "../realtime/messages.ts";
import { readSse, startedGame, submitStep } from "../realtime/test-helpers.ts";
import type { SseReader } from "../realtime/test-helpers.ts";
import { playGame } from "../game/test-helpers.ts";

const SEED = 2;

describe("GET /api/stream: lobby and user topics", () => {
  let db: Kysely<Database>;
  let app: ReturnType<typeof createApp>;
  let bus: ReturnType<typeof createBus<StreamEnvelope>>;
  let readers: SseReader[];

  beforeEach(async () => {
    readers = [];
    db = createDb(":memory:");
    await migrateToLatest(db);
    bus = createBus<StreamEnvelope>();
    app = createApp(db, { seed: () => SEED, bus });
  });

  afterEach(async () => {
    await Promise.all(readers.map((reader) => reader.close()));
    await db.destroy();
  });

  type Player = Awaited<ReturnType<typeof signIn>>;

  const errorCode = async (res: Response) => apiErrorSchema.parse(await res.json()).error.code;
  const gameOf = async (res: Response) => gameResponseSchema.parse(await res.json()).game;

  async function connect(
    cookie: string,
    topics: string,
    headers: Record<string, string> = {},
  ): Promise<SseReader> {
    const res = await app.request(`/api/stream?topics=${topics}`, {
      headers: { cookie, ...headers },
    });
    expect(res.status).toBe(200);
    const reader = readSse(res);
    readers.push(reader);
    return reader;
  }

  async function createRoom(owner: Player, name = "Harbor") {
    return gameOf(await postJson(app, "/api/games", owner.cookie, { name }));
  }
  const join = (game: Game, who: Player) =>
    sendAs(app, "POST", `/api/games/${game.id}/join`, who.cookie);

  describe("lobby", () => {
    test("a connect gets the open games as a snapshot, without an id", async () => {
      const ann = await signIn(app, "Ann");
      const room = await createRoom(ann);
      // Any signed-in user can open it, also one with no seat anywhere.
      const viewer = await signIn(app, "Viewer");

      const reader = await connect(viewer.cookie, "lobby");
      const frame = await reader.next();
      expect(frame.event).toBe("lobby.snapshot");
      expect(frame.id).toBeUndefined();
      expect(frame.message).toMatchObject({
        topic: "lobby",
        type: "lobby.snapshot",
        version: 0,
        payload: { games: [{ id: room.id, ownerName: "Ann", seatCount: 1, tokens: ["dog"] }] },
      });
      await reader.expectQuiet();
    });

    test("every connect gets the full list again", async () => {
      const ann = await signIn(app, "Ann");
      await createRoom(ann, "One");
      const first = await connect(ann.cookie, "lobby");
      await first.next();
      await createRoom(ann, "Two");
      await first.next();

      const second = await connect(ann.cookie, "lobby");
      const frame = await second.next();
      expect(frame.message).toMatchObject({
        type: "lobby.snapshot",
        payload: { games: [{ name: "Two" }, { name: "One" }] },
      });
    });

    test("create, join, token change, start and cancel reach the lobby, with no id", async () => {
      const ann = await signIn(app, "Ann");
      const bo = await signIn(app, "Bo");
      const viewer = await signIn(app, "Viewer");
      const reader = await connect(viewer.cookie, "lobby");
      expect((await reader.next()).event).toBe("lobby.snapshot");

      const room = await createRoom(ann);
      const created = await reader.next();
      expect(created.message).toMatchObject({
        type: "lobby.updated",
        version: 0,
        payload: { game: { id: room.id, seatCount: 1 } },
      });

      await join(room, bo);
      expect((await reader.next()).message).toMatchObject({
        type: "lobby.updated",
        payload: { game: { id: room.id, seatCount: 2, tokens: ["dog", "cat"] } },
      });

      const seatId = room.seats[0]!.id;
      await app.request(`/api/games/${room.id}/seats/${seatId}/token`, {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: ann.cookie },
        body: JSON.stringify({ token: "duck" }),
      });
      expect((await reader.next()).message).toMatchObject({
        type: "lobby.updated",
        payload: { game: { tokens: ["duck", "cat"] } },
      });

      await sendAs(app, "POST", `/api/games/${room.id}/start`, ann.cookie);
      const removed = await reader.next();
      expect(removed.event).toBe("lobby.removed");
      expect(removed.message).toMatchObject({ payload: { gameId: room.id } });

      const second = await createRoom(ann, "Second");
      await reader.next();
      await sendAs(app, "DELETE", `/api/games/${second.id}`, ann.cookie);
      expect((await reader.next()).message).toMatchObject({
        type: "lobby.removed",
        payload: { gameId: second.id },
      });

      await reader.expectQuiet();
    });

    test("cancel sends room.cancelled on the game topic and lobby.removed on the lobby", async () => {
      const ann = await signIn(app, "Ann");
      const room = await createRoom(ann);
      const reader = await connect(ann.cookie, `game:${room.id},lobby`);
      const initial = await reader.take(2);
      expect(initial.map((frame) => frame.message.type).sort()).toEqual([
        "lobby.snapshot",
        "snapshot",
      ]);

      expect((await sendAs(app, "DELETE", `/api/games/${room.id}`, ann.cookie)).status).toBe(204);
      const frames = await reader.take(2);
      const cancelled = frames.find((frame) => frame.event === "room.cancelled")!;
      expect(cancelled.id).toBeUndefined();
      expect(cancelled.message).toMatchObject({
        topic: `game:${room.id}`,
        version: 0,
        payload: { gameId: room.id },
      });
      expect(frames.map((frame) => frame.event).sort()).toEqual([
        "lobby.removed",
        "room.cancelled",
      ]);
    });
  });

  describe("remove player", () => {
    test("the removed user gets room.removed on their user topic, and the game topic ends", async () => {
      const ann = await signIn(app, "Ann");
      const bo = await signIn(app, "Bo");
      const room = await createRoom(ann);
      await join(room, bo);
      const boReader = await connect(bo.cookie, `game:${room.id},user:${bo.user.id}`);
      await boReader.take(2);
      const lobbyReader = await connect(ann.cookie, "lobby");
      await lobbyReader.next();

      const res = await sendAs(
        app,
        "DELETE",
        `/api/games/${room.id}/players/${bo.user.id}`,
        ann.cookie,
      );
      expect(res.status).toBe(200);

      const frames = await boReader.take(2);
      expect(frames.map((frame) => frame.event).sort()).toEqual(["room.removed", "room.updated"]);
      const removed = frames.find((frame) => frame.event === "room.removed")!;
      expect(removed.id).toBeUndefined();
      expect(removed.message).toMatchObject({
        topic: `user:${bo.user.id}`,
        version: 0,
        payload: { gameId: room.id },
      });
      // The lobby hears the new seat list.
      expect((await lobbyReader.next()).message).toMatchObject({
        type: "lobby.updated",
        payload: { game: { id: room.id, seatCount: 1 } },
      });

      // The game topic of the removed user is closed: a later change does not reach them.
      await postJson(app, `/api/games/${room.id}/seats`, ann.cookie, { name: "AnnTwo" });
      await boReader.expectQuiet();
    });
  });

  describe("user topic", () => {
    test("a connect gets the pending invites; each change sends the full list", async () => {
      const ann = await signIn(app, "Ann");
      const bo = await signIn(app, "Bo");
      const room = await createRoom(ann);
      const reader = await connect(bo.cookie, `user:${bo.user.id}`);
      const first = await reader.next();
      expect(first.event).toBe("invites.updated");
      expect(first.id).toBeUndefined();
      expect(first.message).toMatchObject({
        topic: `user:${bo.user.id}`,
        version: 0,
        payload: { invites: [] },
      });

      await postJson(app, `/api/games/${room.id}/invites`, ann.cookie, { name: "Bo" });
      const invited = await reader.next();
      expect(invited.message).toMatchObject({
        type: "invites.updated",
        payload: { invites: [{ gameId: room.id, gameName: "Harbor", hostName: "Ann" }] },
      });
      const inviteId = (invited.message.payload as { invites: { id: string }[] }).invites[0]!.id;

      await sendAs(app, "POST", `/api/invites/${inviteId}/decline`, bo.cookie);
      expect((await reader.next()).message).toMatchObject({
        type: "invites.updated",
        payload: { invites: [] },
      });
      await reader.expectQuiet();
    });

    test("the topic of another user is 403 forbidden_topic and opens no subscription", async () => {
      const ann = await signIn(app, "Ann");
      const bo = await signIn(app, "Bo");
      const res = await app.request(`/api/stream?topics=lobby,user:${bo.user.id}`, {
        headers: { cookie: ann.cookie },
      });
      expect(res.status).toBe(403);
      expect(await errorCode(res)).toBe("forbidden_topic");
      expect(bus.subscriberCount("lobby")).toBe(0);
      expect(bus.subscriberCount(`user:${bo.user.id}`)).toBe(0);
    });

    test("a bad topic is a validation error", async () => {
      const ann = await signIn(app, "Ann");
      for (const topics of ["user:abc", "lobbies", "lobby,"]) {
        const res = await app.request(`/api/stream?topics=${topics}`, {
          headers: { cookie: ann.cookie },
        });
        expect(res.status).toBe(400);
        expect(await errorCode(res)).toBe("validation_error");
      }
    });

    test("the lobby and user topics need a session", async () => {
      const res = await app.request("/api/stream?topics=lobby");
      expect(res.status).toBe(401);
    });
  });

  test("a game resume works with the lobby and user topics in the same stream", async () => {
    const started = await startedGame(app, SEED);
    const steps = playGame(SEED, 4, started.initial).steps;
    for (const step of steps) expect((await submitStep(app, started, step)).status).toBe(200);

    const topics = `lobby,game:${started.game.id},user:${started.owner.user.id}`;
    const reader = await connect(started.owner.cookie, topics, { "last-event-id": "1" });
    const frames = await reader.take(5);
    // The game gets the missed actions, not a snapshot; the others get their full lists.
    expect(frames.map((frame) => [frame.message.type, frame.id])).toEqual([
      ["lobby.snapshot", undefined],
      ["game.actions", "2"],
      ["game.actions", "3"],
      ["game.actions", "4"],
      ["invites.updated", undefined],
    ]);
    await reader.expectQuiet();
  });

  test("a stream with several game topics still gives each a snapshot", async () => {
    const started = await startedGame(app, SEED);
    const other = await createRoom(started.owner);
    const reader = await connect(
      started.owner.cookie,
      `game:${started.game.id},game:${other.id},lobby`,
      { "last-event-id": "0" },
    );
    const frames = await reader.take(3);
    expect(frames.map((frame) => frame.message.type)).toEqual([
      "snapshot",
      "snapshot",
      "lobby.snapshot",
    ]);
  });
});
