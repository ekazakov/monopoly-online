import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
// The app (and with it `@hono/zod-openapi`) loads before `@monopoly/shared`, as the zod extension needs.
import { createApp } from "./app.ts";
import { postJson, signIn } from "./auth/test-helpers.ts";
import { createDb } from "./db/client.ts";
import { migrateToLatest } from "./db/migrations.ts";
import { createQueryObserver, describeQuery } from "./db/query-telemetry.ts";
import type { Database } from "./db/schema.ts";
import { playGame } from "./game/test-helpers.ts";
import { startedGame, submitStep } from "./realtime/test-helpers.ts";
import { installTestTracing } from "./tracing-test-helpers.ts";
import type { Kysely } from "kysely";

const SEED = 2;

describe("tracing", () => {
  let tracing: ReturnType<typeof installTestTracing>;
  let db: Kysely<Database>;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    tracing = installTestTracing();
    db = createDb(":memory:", { log: createQueryObserver() });
    await migrateToLatest(db);
    app = createApp(db, { auth: { guest: true }, seed: () => SEED });
  });

  afterEach(async () => {
    await db.destroy();
    await tracing.uninstall();
  });

  test("a request is one SERVER span named with the route template", async () => {
    const { cookie } = await signIn(app, "Ada");
    const id = crypto.randomUUID();
    const res = await app.request(`/api/games/${id}`, { headers: { cookie } });
    expect(res.status).toBe(404);

    const span = tracing.named("GET /api/games/:id")[0]!;
    expect(span.kind).toBe(SpanKind.SERVER);
    expect(span.attributes).toMatchObject({
      "http.request.method": "GET",
      "http.route": "/api/games/:id",
      "http.response.status_code": 404,
      "harborfront.request_id": res.headers.get("X-Request-Id"),
    });
    // A 404 is an answer, not a fault.
    expect(span.status.code).not.toBe(SpanStatusCode.ERROR);
    // The raw path, with the game id in it, is in no span.
    expect(JSON.stringify(tracing.spans().map((s) => [s.name, s.attributes]))).not.toContain(id);
  });

  test("no span has a client address, a user agent or a URL", async () => {
    await app.request("/api/health?code=secret-code", {
      headers: { "user-agent": "agent-x", "x-forwarded-for": "10.9.8.7" },
    });
    const text = JSON.stringify(tracing.spans().map((s) => s.attributes));
    for (const leak of ["agent-x", "10.9.8.7", "secret-code"]) expect(text).not.toContain(leak);
    for (const span of tracing.spans()) {
      for (const key of Object.keys(span.attributes)) {
        expect(key).not.toMatch(/^(url\.|client\.|user_agent\.|network\.)/);
      }
    }
  });

  test("a 500 sets ERROR and records the exception", async () => {
    app.get("/boom", () => {
      throw new Error("boom");
    });
    const res = await app.request("/api/boom");
    expect(res.status).toBe(500);
    const span = tracing.named("GET /api/boom")[0]!;
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.events.some((event) => event.name === "exception")).toBe(true);
  });

  test("a traceparent header continues the trace of the caller", async () => {
    const traceId = "0af7651916cd43dd8448eb211c80319c";
    await app.request("/api/health", {
      headers: { traceparent: `00-${traceId}-b7ad6b7169203331-01` },
    });
    const span = tracing.named("GET /api/health")[0]!;
    expect(span.spanContext().traceId).toBe(traceId);
    expect(span.parentSpanContext?.spanId).toBe("b7ad6b7169203331");
  });

  test("a query makes a CLIENT span under the request, with the text and no values", async () => {
    await signIn(app, "Ada");
    const request = tracing.named("POST /api/session")[0]!;
    const queries = tracing
      .spans()
      .filter((span) => span.kind === SpanKind.CLIENT && span.parentSpanContext);
    expect(queries.length).toBeGreaterThan(0);
    const insert = queries.find((span) => span.name === "INSERT users")!;
    expect(insert.attributes).toMatchObject({
      "db.system.name": "sqlite",
      "db.operation.name": "INSERT",
      "db.collection.name": "users",
    });
    expect(insert.spanContext().traceId).toBe(request.spanContext().traceId);
    expect(JSON.stringify(insert.attributes)).not.toContain("Ada");
  });

  test("the migrations at start make no span", async () => {
    const other = createDb(":memory:", { log: createQueryObserver() });
    await migrateToLatest(other);
    await other.destroy();
    expect(tracing.spans().filter((span) => span.kind === SpanKind.CLIENT)).toEqual([]);
  });

  test("an action makes an applyAction span with the game id and version, over its queries", async () => {
    const started = await startedGame(app, SEED);
    const [step] = playGame(SEED, 1, started.initial).steps;
    expect((await submitStep(app, started, step!)).status).toBe(200);

    const span = tracing.named("applyAction")[0]!;
    expect(span.attributes).toMatchObject({
      "game.id": started.game.id,
      "game.action.type": step!.action.type,
      "game.version": 1,
      "game.action.repeated": false,
    });
    expect(span.status.code).not.toBe(SpanStatusCode.ERROR);
    const children = tracing
      .spans()
      .filter((child) => child.parentSpanContext?.spanId === span.spanContext().spanId);
    expect(children.some((child) => child.name === "INSERT game_events")).toBe(true);
    // And the action span sits under the request span.
    const request = tracing.named("POST /api/games/:id/actions")[0]!;
    expect(span.parentSpanContext?.spanId).toBe(request.spanContext().spanId);
  });

  test("a refused action has an error code and is not a fault", async () => {
    const started = await startedGame(app, SEED);
    const [step] = playGame(SEED, 1, started.initial).steps;
    const { playerId, ...action } = step!.action;
    const res = await postJson(
      app,
      `/api/games/${started.game.id}/actions`,
      started.cookieOfSeat(playerId),
      { seatId: playerId, action, expectedVersion: 9, clientActionId: crypto.randomUUID() },
    );
    expect(res.status).toBe(409);
    const span = tracing.named("applyAction")[0]!;
    expect(span.attributes["game.error.code"]).toBe("version_conflict");
    expect(span.status.code).not.toBe(SpanStatusCode.ERROR);
  });
});

describe("describeQuery", () => {
  test.each([
    ['select "id" from "games" where "id" = ?', { operation: "SELECT", table: "games" }],
    ['insert into "game_events" ("a") values (?)', { operation: "INSERT", table: "game_events" }],
    ['update "games" set "version" = ?', { operation: "UPDATE", table: "games" }],
    ['delete from "seats" where "id" = ?', { operation: "DELETE", table: "seats" }],
    ["begin", { operation: "BEGIN" }],
    ["commit", { operation: "COMMIT" }],
  ])("%s", (sql, expected) => {
    expect(describeQuery(sql)).toEqual(expected);
  });
});
