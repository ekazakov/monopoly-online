import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
// The app (and with it `@hono/zod-openapi`) loads before `@monopoly/shared`, as the zod extension needs.
import { createApp } from "./app.ts";
import { notReadyResponseSchema, readyResponseSchema } from "@monopoly/shared";
import { createDb } from "./db/client.ts";
import { migrateTo, migrateToLatest, pendingMigrations } from "./db/migrations.ts";
import { checkReadiness } from "./db/ready.ts";
import type { Database } from "./db/schema.ts";
import { createMemoryLogger, type LogLine } from "./log-test-helpers.ts";
import type { Kysely } from "kysely";

describe("checkReadiness", () => {
  let db: Kysely<Database>;

  beforeEach(() => {
    db = createDb(":memory:");
  });

  afterEach(async () => {
    // A test may have closed it already.
    await db.destroy().catch(() => {});
  });

  test("a migrated database is ready", async () => {
    await migrateToLatest(db);
    expect(await checkReadiness(db)).toEqual({ database: "ok", migrations: "ok" });
  });

  test("a database with no migration table has every migration pending", async () => {
    expect(await checkReadiness(db)).toEqual({ database: "ok", migrations: "pending" });
    expect((await pendingMigrations(db)).length).toBeGreaterThan(1);
  });

  test("a database with some migrations has the rest pending", async () => {
    await migrateTo(db, "0001_games");
    expect(await checkReadiness(db)).toEqual({ database: "ok", migrations: "pending" });
    expect(await pendingMigrations(db)).not.toContain("0001_games");
  });

  test("a migration table that cannot be read fails the migrations check", async () => {
    await migrateToLatest(db);
    // A table with that name but no `name` column.
    await db.schema.dropTable("kysely_migration").execute();
    await db.schema.createTable("kysely_migration").addColumn("other", "text").execute();
    expect(await checkReadiness(db)).toEqual({ database: "ok", migrations: "failed" });
  });

  test("a closed database fails both checks, and nothing throws", async () => {
    await migrateToLatest(db);
    await db.destroy();
    expect(await checkReadiness(db)).toEqual({ database: "failed", migrations: "failed" });
  });

  test("the check writes nothing: it does not make the migration table", async () => {
    await checkReadiness(db);
    const tables = await db.introspection.getTables({ withInternalKyselyTables: true });
    expect(tables.map((table) => table.name)).toEqual([]);
  });
});

describe("GET /api/ready", () => {
  let db: Kysely<Database>;
  let lines: LogLine[];
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    db = createDb(":memory:");
    await migrateToLatest(db);
    const memory = createMemoryLogger();
    lines = memory.lines;
    app = createApp(db, { logger: memory.logger });
  });

  afterEach(async () => {
    await db.destroy().catch(() => {});
  });

  test("200 when the database works and the migrations have run, with no session", async () => {
    const res = await app.request("/api/ready");
    expect(res.status).toBe(200);
    expect(readyResponseSchema.parse(await res.json())).toEqual({
      status: "ready",
      checks: { database: "ok", migrations: "ok" },
    });
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
  });

  test("503 with the failed checks when the database is closed, and no error text", async () => {
    await db.destroy();
    const res = await app.request("/api/ready");
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(notReadyResponseSchema.parse(JSON.parse(text))).toEqual({
      status: "not_ready",
      checks: { database: "failed", migrations: "failed" },
    });
    expect(text).not.toMatch(/connection|sqlite|error/i);
    expect(lines.find((line) => line.msg === "not ready")).toMatchObject({ level: "warn" });
  });

  test("503 while a migration is pending", async () => {
    const old = createDb(":memory:");
    await migrateTo(old, "0001_games");
    const res = await createApp(old).request("/api/ready");
    expect(res.status).toBe(503);
    expect(notReadyResponseSchema.parse(await res.json()).checks.migrations).toBe("pending");
    await old.destroy();
  });

  test("a success is logged at debug, like the health check", async () => {
    await app.request("/api/ready");
    expect(lines.find((line) => line.msg === "request")).toMatchObject({
      level: "debug",
      route: "/api/ready",
    });
  });
});
