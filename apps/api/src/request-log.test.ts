import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { createApp } from "./app.ts";
import { postJson, signIn } from "./auth/test-helpers.ts";
import { createDb } from "./db/client.ts";
import { migrateToLatest } from "./db/migrations.ts";
import type { Database } from "./db/schema.ts";
import { createMemoryLogger, type LogLine } from "./log-test-helpers.ts";
import { readSse } from "./realtime/test-helpers.ts";
import type { Kysely } from "kysely";

describe("request id and request log", () => {
  let db: Kysely<Database>;
  let app: ReturnType<typeof createApp>;
  let lines: LogLine[];

  beforeEach(async () => {
    db = createDb(":memory:");
    await migrateToLatest(db);
    const memory = createMemoryLogger();
    lines = memory.lines;
    app = createApp(db, { auth: { guest: true }, logger: memory.logger });
  });

  afterEach(async () => {
    await db.destroy();
  });

  const requestLines = () => lines.filter((line) => line.msg === "request");

  test("each response has a new X-Request-Id", async () => {
    const a = await app.request("/api/health");
    const b = await app.request("/api/health");
    expect(a.headers.get("X-Request-Id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(b.headers.get("X-Request-Id")).not.toBe(a.headers.get("X-Request-Id"));
  });

  test("the header is on an error response and on a 404", async () => {
    const unknown = await app.request("/api/nope");
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get("X-Request-Id")).toBeTruthy();
    const unauthorized = await app.request("/api/me");
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("X-Request-Id")).toBeTruthy();
  });

  test("a safe incoming id is kept and is in the log line", async () => {
    const res = await app.request("/api/health", { headers: { "X-Request-Id": "abc-123_X.y" } });
    expect(res.headers.get("X-Request-Id")).toBe("abc-123_X.y");
    expect(lines.find((line) => line.msg === "request")).toMatchObject({
      requestId: "abc-123_X.y",
    });
  });

  test.each(["has space", "x".repeat(65), "<script>", "caf\u00e9"])(
    "an unsafe incoming id %j is replaced",
    async (unsafe) => {
      const res = await app.request("/api/health", { headers: { "X-Request-Id": unsafe } });
      expect(res.headers.get("X-Request-Id")).toMatch(/^[0-9a-f-]{36}$/);
    },
  );

  test("one line for each request, with the route template and not the raw path", async () => {
    const { cookie } = await signIn(app, "Ada");
    lines.length = 0;
    const id = crypto.randomUUID();
    const res = await app.request(`/api/games/${id}`, { headers: { cookie } });
    expect(res.status).toBe(404);
    expect(requestLines()).toHaveLength(1);
    const [line] = requestLines();
    expect(line).toMatchObject({
      level: "info",
      method: "GET",
      route: "/api/games/:id",
      status: 404,
    });
    expect(typeof line!.durationMs).toBe("number");
    expect(JSON.stringify(lines)).not.toContain(id);
  });

  test("a refused request is logged, and the line has no cookie", async () => {
    const res = await postJson(app, "/api/games", "harborfront_session=secret-token", {
      name: "x",
    });
    expect(res.status).toBe(401);
    expect(requestLines()).toHaveLength(1);
    expect(requestLines()[0]).toMatchObject({ method: "POST", status: 401 });
    expect(JSON.stringify(lines)).not.toContain("secret-token");
  });

  test("a probe is logged at debug", async () => {
    await app.request("/api/health");
    expect(requestLines()[0]).toMatchObject({ level: "debug", route: "/api/health" });
  });

  test("the stream logs open and close", async () => {
    const { cookie, user } = await signIn(app, "Ada");
    lines.length = 0;
    const res = await app.request("/api/stream?topics=lobby", { headers: { cookie } });
    expect(res.status).toBe(200);
    const requestId = res.headers.get("X-Request-Id")!;
    const reader = readSse(res);
    await reader.close();
    // The close line is written after the abort has run.
    await expect.poll(() => lines.some((line) => line.msg === "stream closed")).toBe(true);
    const opened = lines.find((line) => line.msg === "stream open");
    const closed = lines.find((line) => line.msg === "stream closed");
    expect(opened).toMatchObject({ requestId, userId: user.id, topics: ["lobby"] });
    expect(closed).toMatchObject({ requestId, userId: user.id });
    expect(typeof closed!.durationMs).toBe("number");
  });
});
