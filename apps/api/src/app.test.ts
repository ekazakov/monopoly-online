import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { apiErrorSchema } from "@monopoly/shared";
import type { Kysely } from "kysely";
import { createApp } from "./app.ts";
import { createDb } from "./db/client.ts";
import { migrateToLatest } from "./db/migrations.ts";
import type { Database } from "./db/schema.ts";

describe("api", () => {
  let db: Kysely<Database>;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    db = createDb(":memory:");
    await migrateToLatest(db);
    app = createApp(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  test("GET /api/health returns ok", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test("unknown route returns not_found", async () => {
    const res = await app.request("/api/nope");
    expect(res.status).toBe(404);
    const body = apiErrorSchema.parse(await res.json());
    expect(body.error.code).toBe("not_found");
  });
});
