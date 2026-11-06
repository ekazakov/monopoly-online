import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
// The app (and with it `@hono/zod-openapi`) loads before `@monopoly/shared`, as the zod extension needs.
import { createApp } from "../app.ts";
import { postJson, sendAs, signIn } from "../auth/test-helpers.ts";
import { apiErrorSchema, gameResponseSchema, streamMessageSchema } from "@monopoly/shared";
import type { StreamMessage } from "@monopoly/shared";
import type { Kysely } from "kysely";
import { createDb } from "../db/client.ts";
import { migrateToLatest } from "../db/migrations.ts";
import type { Database } from "../db/schema.ts";
import { deserializeState } from "../game/loader.ts";
import { redactState } from "../game/redact.ts";
import { playGame } from "../game/test-helpers.ts";
import { createBus } from "../realtime/bus.ts";
import { gameTopic } from "../realtime/messages.ts";
import type { StreamEnvelope } from "../realtime/messages.ts";
import { startedGame, submitStep } from "../realtime/test-helpers.ts";
import type { StartedGame } from "../realtime/test-helpers.ts";

const SEED = 2;

describe("POST /api/games/:id/finish", () => {
  let db: Kysely<Database>;
  let app: ReturnType<typeof createApp>;
  let started: StartedGame;
  let seen: StreamMessage[];

  beforeEach(async () => {
    db = createDb(":memory:");
    await migrateToLatest(db);
    const bus = createBus<StreamEnvelope>();
    app = createApp(db, { seed: () => SEED, bus });
    started = await startedGame(app, SEED);
    seen = [];
    bus.subscribe(gameTopic(started.game.id), (message) => {
      seen.push(streamMessageSchema.parse(message));
    });
  });

  afterEach(async () => {
    await db.destroy();
  });

  const finish = (cookie: string, id = started.game.id) =>
    sendAs(app, "POST", `/api/games/${id}/finish`, cookie);
  const errorCode = async (res: Response) => apiErrorSchema.parse(await res.json()).error.code;

  async function play(count: number) {
    for (const step of playGame(SEED, count, started.initial).steps) {
      expect((await submitStep(app, started, step)).status).toBe(200);
    }
  }

  const gameRow = () =>
    db
      .selectFrom("games")
      .select(["status", "version"])
      .where("id", "=", started.game.id)
      .executeTakeFirstOrThrow();

  async function turnStartState() {
    const row = await db
      .selectFrom("game_snapshots")
      .select(["version", "state"])
      .where("turn_start", "=", 1)
      .orderBy("version", "desc")
      .executeTakeFirstOrThrow();
    return deserializeState(row.state);
  }

  test("an active game rolls back to the start of the turn and finishes", async () => {
    await play(8);
    const before = await gameRow();
    const turnStart = await turnStartState();
    expect(turnStart.version).toBeLessThan(before.version);

    const res = await finish(started.owner.cookie);

    expect(res.status).toBe(200);
    const { game } = gameResponseSchema.parse(await res.json());
    expect(game).toMatchObject({ id: started.game.id, status: "finished" });
    expect(game.version).toBe(before.version + 1);
    expect(await gameRow()).toEqual({ status: "finished", version: before.version + 1 });
  });

  test("every device gets a snapshot with the new game and the rolled back state", async () => {
    await play(8);
    const turnStart = await turnStartState();
    seen.length = 0;

    const res = await finish(started.owner.cookie);
    const { game } = gameResponseSchema.parse(await res.json());

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({
      topic: gameTopic(started.game.id),
      type: "snapshot",
      version: game.version,
      payload: { game, state: redactState({ ...turnStart, version: game.version }) },
    });
  });

  test("a saved game finishes with no rollback and keeps its version", async () => {
    await play(8);
    // Save (C3) does not exist yet: set the status by hand.
    await db
      .updateTable("games")
      .set({ status: "saved" })
      .where("id", "=", started.game.id)
      .execute();
    const before = await gameRow();
    seen.length = 0;

    const res = await finish(started.owner.cookie);

    expect(res.status).toBe(200);
    expect(await gameRow()).toEqual({ status: "finished", version: before.version });
    expect(seen.map((m) => m.type)).toEqual(["snapshot"]);
    expect(seen[0]?.version).toBe(before.version);
  });

  test("only the owner can finish: a guest gets 403 not_game_owner", async () => {
    const res = await finish(started.guest.cookie);
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe("not_game_owner");
    expect((await gameRow()).status).toBe("active");
    expect(seen).toHaveLength(0);
  });

  test("an unknown game is 404 and no session is 401", async () => {
    const missing = "00000000-0000-4000-8000-0000000000aa";
    const res = await finish(started.owner.cookie, missing);
    expect(res.status).toBe(404);
    expect((await sendAs(app, "POST", `/api/games/${started.game.id}/finish`, "")).status).toBe(
      401,
    );
  });

  test("a finished game is 409 game_not_active", async () => {
    expect((await finish(started.owner.cookie)).status).toBe(200);
    const again = await finish(started.owner.cookie);
    expect(again.status).toBe(409);
    expect(await errorCode(again)).toBe("game_not_active");
  });

  test("a waiting game is 409 game_not_active", async () => {
    const room = gameResponseSchema.parse(
      await (await postJson(app, "/api/games", started.owner.cookie, { name: "Dock" })).json(),
    ).game;
    const res = await finish(started.owner.cookie, room.id);
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe("game_not_active");
  });

  test("a user who is not in the game cannot finish it", async () => {
    const stranger = await signIn(app, "Zed");
    const res = await finish(stranger.cookie);
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe("not_game_owner");
  });
});
