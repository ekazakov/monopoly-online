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

  test("POST then GET /api/games", async () => {
    const created = await app.request("/api/games", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Friday game" }),
    });
    expect(created.status).toBe(201);

    const res = await app.request("/api/games");
    const games = (await res.json()) as Array<{ name: string }>;
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({ name: "Friday game" });
  });

  test("POST /api/games rejects an empty name", async () => {
    const res = await app.request("/api/games", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "  " }),
    });
    expect(res.status).toBe(400);
    const body = apiErrorSchema.parse(await res.json());
    expect(body.error.code).toBe("validation_error");
    expect(body.error.issues?.[0]?.path).toEqual(["name"]);
  });

  test("POST /api/games rejects bad JSON", async () => {
    const res = await app.request("/api/games", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    const body = apiErrorSchema.parse(await res.json());
    expect(body.error.code).toBe("bad_request");
  });

  test("unknown route returns not_found", async () => {
    const res = await app.request("/api/nope");
    expect(res.status).toBe(404);
    const body = apiErrorSchema.parse(await res.json());
    expect(body.error.code).toBe("not_found");
  });
});
