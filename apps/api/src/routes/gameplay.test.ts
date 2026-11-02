import { OpenAPIHono } from "@hono/zod-openapi";
import type { Action } from "@monopoly/game-engine";
import {
  actionResponseSchema,
  apiErrorSchema,
  gameStateResponseSchema,
  redactedGameStateSchema,
} from "@monopoly/shared";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { createDb } from "../db/client.ts";
import { migrateToLatest } from "../db/migrations.ts";
import type { Database } from "../db/schema.ts";
import { errorBody, errorHandler, notFoundHandler, validationHook } from "../errors.ts";
import { createGameStateLoader } from "../game/loader.ts";
import { createGameService } from "../game/service.ts";
import type { CommittedAction } from "../game/service.ts";
import {
  GAME_ID,
  OTHER_USER_ID,
  STRANGER_ID,
  USER_ID,
  UUID_SEAT_IDS,
  insertActiveGame,
  insertGame,
  newGame,
  playGame,
} from "../game/test-helpers.ts";
import { resolveDeps, type AppEnv } from "./common.ts";
import { createGameplayRoutes, gameplayRoutes } from "./gameplay.ts";

const SEED = 2;
const initial = newGame(SEED, UUID_SEAT_IDS);
const [first, second, third] = initial.players.map((p) => p.id) as [string, string, string];

let db: Kysely<Database>;
let app: OpenAPIHono<AppEnv>;
let controllers: Record<string, string>;
let committed: CommittedAction[];

/** A test-only stand-in for the auth middleware: the `x-test-user` header holds the user id. */
function appWith(routes: ReturnType<typeof gameplayRoutes>) {
  const testApp = new OpenAPIHono<AppEnv>({ defaultHook: validationHook })
    .basePath("/api")
    .notFound(notFoundHandler)
    .onError(errorHandler);
  testApp.use("*", async (c, next) => {
    const id = c.req.header("x-test-user");
    if (!id) return c.json(errorBody("unauthorized", "Not signed in"), 401);
    c.set("user", { id, name: "Tester", createdAt: new Date().toISOString() });
    await next();
  });
  return testApp.route("/", routes) as unknown as OpenAPIHono<AppEnv>;
}

beforeEach(async () => {
  db = createDb(":memory:");
  await migrateToLatest(db);
  ({ controllers } = await insertActiveGame(db, initial));
  committed = [];
  const deps = resolveDeps(db);
  const service = createGameService({
    db,
    loader: createGameStateLoader(db),
    onCommitted: (event) => committed.push(event),
  });
  app = appWith(gameplayRoutes({ ...deps, service }));
});

afterEach(async () => {
  await db.destroy();
});

type Body = Record<string, unknown>;

async function post(userId: string, body: Body, gameId = GAME_ID) {
  return app.request(`/api/games/${gameId}/actions`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user": userId },
    body: JSON.stringify(body),
  });
}

const get = (userId: string | null, gameId = GAME_ID) =>
  app.request(`/api/games/${gameId}/state`, {
    headers: userId ? { "x-test-user": userId } : {},
  });

const request = (
  seatId: string,
  action: Body,
  expectedVersion: number,
  clientActionId?: string,
) => ({
  seatId,
  action,
  expectedVersion,
  clientActionId: clientActionId ?? crypto.randomUUID(),
});

async function errorOf(res: Response, status: number) {
  expect(res.status).toBe(status);
  return apiErrorSchema.parse(await res.json()).error;
}

describe("POST /games/{id}/actions", () => {
  test("accepts an action and returns version, events and the redacted state", async () => {
    const res = await post(USER_ID, request(first, { type: "RollDice" }, 0));
    expect(res.status).toBe(200);
    const body = actionResponseSchema.parse(await res.json());
    expect(body.version).toBe(1);
    expect(body.events[0]).toMatchObject({ type: "DiceRolled", playerId: first });
    expect(body.state.version).toBe(1);
    expect(committed).toHaveLength(1);
  });

  test("a seeded script over HTTP matches a direct engine replay", async () => {
    const played = playGame(SEED, 40, initial);
    for (const step of played.steps) {
      const { playerId, ...action } = step.action as Action & Body;
      const res = await post(
        controllers[playerId as string] as string,
        request(playerId as string, action, step.state.version - 1),
      );
      expect(res.status).toBe(200);
      const body = actionResponseSchema.parse(await res.json());
      expect(body.events).toEqual(step.events);
      expect(body.version).toBe(step.state.version);
    }
    const state = gameStateResponseSchema.parse(await (await get(USER_ID)).json());
    expect(state.version).toBe(40);
    expect(state.state.players).toEqual(played.steps[39]?.state.players);
  });

  test("a stale expectedVersion gives 409 version_conflict with currentVersion", async () => {
    await post(USER_ID, request(first, { type: "RollDice" }, 0));
    const error = await errorOf(await post(USER_ID, request(first, { type: "RollDice" }, 0)), 409);
    expect(error).toMatchObject({ code: "version_conflict", currentVersion: 1 });
  });

  test("a repeated clientActionId returns the stored result", async () => {
    const body = request(first, { type: "RollDice" }, 0);
    const one = await (await post(USER_ID, body)).json();
    const res = await post(USER_ID, body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(one);
    expect(committed).toHaveLength(1);
  });

  test("a user without a seat gets 403 not_a_member", async () => {
    const error = await errorOf(
      await post(STRANGER_ID, request(first, { type: "RollDice" }, 0)),
      403,
    );
    expect(error.code).toBe("not_a_member");
  });

  test("a seat of another device gets 403 not_your_seat", async () => {
    const error = await errorOf(
      await post(OTHER_USER_ID, request(first, { type: "RollDice" }, 0)),
      403,
    );
    expect(error.code).toBe("not_your_seat");
  });

  test("unknown game and unknown seat give 404", async () => {
    const unknownGame = "10000000-0000-4000-8000-0000000000ff";
    expect(
      (
        await errorOf(
          await post(USER_ID, request(first, { type: "RollDice" }, 0), unknownGame),
          404,
        )
      ).code,
    ).toBe("not_found");
    const unknownSeat = "20000000-0000-4000-8000-0000000000ff";
    expect(
      (await errorOf(await post(USER_ID, request(unknownSeat, { type: "RollDice" }, 0)), 404)).code,
    ).toBe("not_found");
  });

  test("engine rejections give 422 with the engine code", async () => {
    const turn = await errorOf(await post(USER_ID, request(third, { type: "RollDice" }, 0)), 422);
    expect(turn.code).toBe("not_your_turn");
    const phase = await errorOf(await post(USER_ID, request(first, { type: "EndTurn" }, 0)), 422);
    expect(phase.code).toBe("wrong_phase");
    expect(committed).toHaveLength(0);
  });

  test("a game that ends is finished: actions give 409, the state stays readable", async () => {
    expect((await post(OTHER_USER_ID, request(second, { type: "Resign" }, 0))).status).toBe(200);
    const end = await post(USER_ID, request(third, { type: "Resign" }, 1));
    expect(end.status).toBe(200);
    const endBody = actionResponseSchema.parse(await end.json());
    expect(endBody.events.map((e) => e.type)).toContain("GameEnded");

    const error = await errorOf(await post(USER_ID, request(first, { type: "RollDice" }, 2)), 409);
    expect(error.code).toBe("game_not_active");

    const res = await get(OTHER_USER_ID);
    expect(res.status).toBe(200);
    const state = gameStateResponseSchema.parse(await res.json());
    expect(state).toEqual({ version: 2, state: endBody.state });
    expect(state.state.turn.phase).toBe("game_over");
  });

  test("a waiting game gives 409 game_not_active", async () => {
    const waitingId = "10000000-0000-4000-8000-000000000009";
    const ids = [
      "40000000-0000-4000-8000-000000000001",
      "40000000-0000-4000-8000-000000000002",
      "40000000-0000-4000-8000-000000000003",
    ];
    await insertGame(db, newGame(4, ids), waitingId);
    const error = await errorOf(
      await post(USER_ID, request(ids[0] as string, { type: "RollDice" }, 0), waitingId),
      409,
    );
    expect(error.code).toBe("game_not_active");
  });

  test("invalid bodies give 400 validation_error", async () => {
    const cases: Body[] = [
      { ...request(first, { type: "RollDice" }, 0), playerId: first },
      request(first, { type: "Teleport" }, 0),
      request("not-a-uuid", { type: "RollDice" }, 0),
      request(first, { type: "RollDice" }, -1),
      { seatId: first },
    ];
    for (const body of cases) {
      expect((await errorOf(await post(USER_ID, body), 400)).code).toBe("validation_error");
    }
    expect(
      (await errorOf(await post(USER_ID, request(first, { type: "RollDice" }, 0), "nope"), 400))
        .code,
    ).toBe("validation_error");
  });

  test("the response never holds rng, decks or the seed", async () => {
    const res = await post(USER_ID, request(first, { type: "RollDice" }, 0));
    const text = await res.text();
    expect(text).not.toMatch(/"(rng|decks|seed)"/);
    expect(JSON.stringify(redactedGameStateSchema.parse(JSON.parse(text).state))).toBe(
      JSON.stringify(JSON.parse(text).state),
    );
  });
});

describe("GET /games/{id}/state", () => {
  test("returns the redacted state with its version", async () => {
    await post(USER_ID, request(first, { type: "RollDice" }, 0));
    for (const userId of [USER_ID, OTHER_USER_ID]) {
      const res = await get(userId);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).not.toMatch(/"(rng|decks|seed)"/);
      const body = gameStateResponseSchema.parse(JSON.parse(text));
      expect(body.version).toBe(1);
      expect(body.state.version).toBe(1);
    }
  });

  test("errors: 404 unknown game, 403 stranger, 409 waiting, 401 without a session", async () => {
    expect(
      (await errorOf(await get(USER_ID, "10000000-0000-4000-8000-0000000000ff"), 404)).code,
    ).toBe("not_found");
    expect((await errorOf(await get(STRANGER_ID), 403)).code).toBe("not_a_member");
    const waitingId = "10000000-0000-4000-8000-000000000009";
    await insertGame(db, newGame(4, ["seat-x", "seat-y", "seat-z"]), waitingId);
    expect((await errorOf(await get(USER_ID, waitingId), 409)).code).toBe("game_not_active");
    expect((await errorOf(await get(null), 401)).code).toBe("unauthorized");
  });
});

describe("createGameplayRoutes", () => {
  test("builds the loader and the service from deps", async () => {
    const seen: CommittedAction[] = [];
    const built = appWith(
      createGameplayRoutes(resolveDeps(db), { onCommitted: (event) => seen.push(event) }),
    );
    const res = await built.request(`/api/games/${GAME_ID}/actions`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user": USER_ID },
      body: JSON.stringify(request(first, { type: "RollDice" }, 0)),
    });
    expect(res.status).toBe(200);
    expect(seen).toHaveLength(1);
  });

  test("declares both routes in the OpenAPI document", () => {
    const doc = gameplayRoutes({
      ...resolveDeps(db),
      service: createGameService({ db, loader: createGameStateLoader(db) }),
    }).getOpenAPI31Document({ openapi: "3.1.0", info: { title: "t", version: "0" } });
    expect(Object.keys(doc.paths ?? {}).sort()).toEqual([
      "/games/{id}/actions",
      "/games/{id}/state",
    ]);
    const statuses = Object.keys(doc.paths?.["/games/{id}/actions"]?.post?.responses ?? {});
    expect(statuses).toEqual(["200", "400", "401", "403", "404", "409", "422", "500"]);
  });
});
