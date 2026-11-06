import { randomUUID } from "node:crypto";
import type { GameEvent } from "@monopoly/game-engine";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
// The app (and with it `@hono/zod-openapi`) loads before `@monopoly/shared`, as the zod extension needs.
import { createApp } from "../app.ts";
import { postJson, sendAs, signIn } from "../auth/test-helpers.ts";
import { apiErrorSchema, gameResponseSchema, gameResultResponseSchema } from "@monopoly/shared";
import { createDb } from "../db/client.ts";
import { migrateToLatest } from "../db/migrations.ts";
import type { Database } from "../db/schema.ts";
import { createGameStateLoader } from "../game/loader.ts";
import type { GameStateLoader } from "../game/loader.ts";
import { playGame } from "../game/test-helpers.ts";
import { startedGame, submitStep } from "../realtime/test-helpers.ts";
import type { StartedGame } from "../realtime/test-helpers.ts";

const SEED = 2;
const MISSING_ID = "00000000-0000-4000-8000-0000000000aa";

describe("GET /api/games/{id}/result", () => {
  let db: Kysely<Database>;
  let app: ReturnType<typeof createApp>;
  let loader: GameStateLoader;

  beforeEach(async () => {
    db = createDb(":memory:");
    await migrateToLatest(db);
    loader = createGameStateLoader(db);
    app = createApp(db, { seed: () => SEED, loader });
  });

  afterEach(async () => {
    await db.destroy();
  });

  const errorOf = async (res: Response, status: number) => {
    expect(res.status).toBe(status);
    return apiErrorSchema.parse(await res.json()).error;
  };
  const resultOf = (gameId: string, cookie?: string) =>
    sendAs(app, "GET", `/api/games/${gameId}/result`, cookie);

  async function resign(started: StartedGame, seatId: string, version: number) {
    const res = await postJson(
      app,
      `/api/games/${started.game.id}/actions`,
      started.cookieOfSeat(seatId),
      {
        seatId,
        action: { type: "Resign" },
        expectedVersion: version,
        clientActionId: randomUUID(),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: number; events: GameEvent[] };
    return body;
  }

  test("needs the session", async () => {
    expect((await errorOf(await resultOf(MISSING_ID), 401)).code).toBe("unauthorized");
  });

  test("rejects an id that is not a UUID", async () => {
    const { cookie } = await signIn(app, "Alice");
    expect((await errorOf(await resultOf("nope", cookie), 400)).code).toBe("validation_error");
  });

  test("404 for an unknown game", async () => {
    const { cookie } = await signIn(app, "Alice");
    expect((await errorOf(await resultOf(MISSING_ID, cookie), 404)).code).toBe("not_found");
  });

  test("403 for a user without a seat", async () => {
    const started = await startedGame(app, SEED);
    const stranger = await signIn(app, "Stranger");
    const error = await errorOf(await resultOf(started.game.id, stranger.cookie), 403);
    expect(error.code).toBe("not_a_member");
  });

  test("409 game_not_finished while the game is waiting", async () => {
    const owner = await signIn(app, "Alice");
    const created = gameResponseSchema.parse(
      await (await postJson(app, "/api/games", owner.cookie, { name: "Harbor" })).json(),
    );
    const error = await errorOf(await resultOf(created.game.id, owner.cookie), 409);
    expect(error.code).toBe("game_not_finished");
  });

  test("409 game_not_finished while the game is active", async () => {
    const started = await startedGame(app, SEED);
    const error = await errorOf(await resultOf(started.game.id, started.owner.cookie), 409);
    expect(error.code).toBe("game_not_finished");
  });

  test("200 with ranks, statuses, rounds and seat controllers for a finished game", async () => {
    const started = await startedGame(app, SEED);
    const [first, second, third] = started.game.seats;
    if (!first || !second || !third) throw new Error("Expected three seats");

    // Play on until no auction runs, so that a resign is accepted at once.
    const steps = playGame(SEED, 60, started.initial).steps;
    const count = steps.findLastIndex((step) => !step.state.auction) + 1;
    const events: GameEvent[] = [];
    for (const step of steps.slice(0, count)) {
      expect((await submitStep(app, started, step)).status).toBe(200);
      events.push(...step.events);
    }
    const lastStep = steps[count - 1];
    let version = lastStep?.state.version ?? 0;

    // The third and then the second seat resign; the first seat wins.
    for (const seat of [third, second]) {
      const body = await resign(started, seat.id, version);
      version = body.version;
      events.push(...body.events);
    }

    const res = await resultOf(started.game.id, started.owner.cookie);
    expect(res.status).toBe(200);
    const { result } = gameResultResponseSchema.parse(await res.json());

    const ended = events.find((e) => e.type === "GameEnded");
    expect(ended).toBeDefined();
    const turns = events.filter((e) => e.type === "TurnEnded").length;
    const outRoundOf = (seatId: string) => {
      const index = events.findIndex((e) => e.type === "PlayerEliminated" && e.playerId === seatId);
      const before = events.slice(0, index).filter((e) => e.type === "TurnEnded").length;
      return 1 + Math.floor(before / 3);
    };

    expect(result.gameId).toBe(started.game.id);
    expect(result.rounds).toBe(1 + Math.floor(turns / 3));
    expect(result.winner?.seatId).toBe(first.id);
    expect(result.standings.map((s) => [s.rank, s.seatId, s.status])).toEqual([
      [1, first.id, "winner"],
      [2, second.id, "resigned"],
      [3, third.id, "resigned"],
    ]);
    expect(result.standings.map((s) => s.name)).toEqual([first.name, second.name, third.name]);
    // Alice owns the first seat and the hot-seat seat Carol; Bobby owns the second seat.
    expect(result.standings.map((s) => s.controllerUserId)).toEqual([
      first.controllerUserId,
      second.controllerUserId,
      third.controllerUserId,
    ]);
    const hotSeat = started.game.seats.find((s) => s.kind === "hotseat");
    expect(result.standings.find((s) => s.seatId === hotSeat?.id)?.controllerUserId).toBe(
      started.owner.user.id,
    );
    expect(result.standings[1]).toMatchObject({
      outRound: outRoundOf(second.id),
      cash: 0,
      properties: 0,
      netWorth: 0,
    });
    expect(result.standings[2]?.outRound).toBe(outRoundOf(third.id));
    expect(result.standings[0]?.outRound).toBeNull();
    const finalState = await loader.load(started.game.id);
    const winner = finalState?.players.find((p) => p.id === first.id);
    expect(result.standings[0]?.cash).toBe(winner?.cash);
    expect(result.standings[0]?.netWorth).toBeGreaterThanOrEqual(winner?.cash ?? 0);

    // Another member sees the same result, also after the cache was dropped (a reload).
    loader.clear();
    const again = await resultOf(started.game.id, started.guest.cookie);
    expect(gameResultResponseSchema.parse(await again.json()).result).toEqual(result);
  });
});
