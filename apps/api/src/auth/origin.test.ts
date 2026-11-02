import { afterEach, describe, expect, test } from "vite-plus/test";
// The app (and with it `@hono/zod-openapi`) loads before `@monopoly/shared`, as the zod extension needs.
import { createTestApp, signIn } from "./test-helpers.ts";
import { apiErrorSchema } from "@monopoly/shared";
import type { Kysely } from "kysely";
import type { AppOptions } from "../app.ts";
import type { Database } from "../db/schema.ts";

describe("origin check", () => {
  let db: Kysely<Database> | undefined;
  afterEach(async () => {
    await db?.destroy();
  });

  async function post(
    headers: Record<string, string>,
    options?: AppOptions,
    url = "http://example.test/api/session",
  ) {
    const made = await createTestApp(options);
    db = made.db;
    return made.app.request(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ name: "Ann" }),
    });
  }

  test("a foreign origin gets 403 forbidden_origin on POST", async () => {
    const res = await post({ origin: "https://evil.test" });
    expect(res.status).toBe(403);
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe("forbidden_origin");
    expect(await db!.selectFrom("users").select("id").execute()).toEqual([]);
  });

  test("the origin of the request URL passes", async () => {
    expect((await post({ origin: "http://example.test" })).status).toBe(201);
  });

  test("the Host header with the request protocol passes", async () => {
    const res = await post({ origin: "http://app.test:8080", host: "app.test:8080" });
    expect(res.status).toBe(201);
  });

  test("X-Forwarded-Host and X-Forwarded-Proto pass", async () => {
    const res = await post({
      origin: "https://public.test",
      "x-forwarded-host": "public.test",
      "x-forwarded-proto": "https",
    });
    expect(res.status).toBe(201);
  });

  test("a different scheme on the same host is refused", async () => {
    const res = await post({ origin: "https://example.test", host: "example.test" });
    expect(res.status).toBe(403);
  });

  test("the literal origin null is refused", async () => {
    expect((await post({ origin: "null" })).status).toBe(403);
  });

  test("a missing Origin header passes", async () => {
    expect((await post({})).status).toBe(201);
  });

  test("an origin from allowedOrigins passes", async () => {
    const options = { allowedOrigins: ["https://game.test"] };
    expect((await post({ origin: "https://game.test" }, options)).status).toBe(201);
  });

  test("the Vite dev server is allowed only in development", async () => {
    const origin = { origin: "http://localhost:5173" };
    expect((await post(origin, { nodeEnv: "development" })).status).toBe(201);
    expect((await post(origin, { nodeEnv: "test" })).status).toBe(403);
    expect((await post(origin, { nodeEnv: "production" })).status).toBe(403);
    expect(
      (await post({ origin: "http://127.0.0.1:5173" }, { nodeEnv: "development" })).status,
    ).toBe(201);
  });

  test("DELETE is checked and GET is not", async () => {
    const made = await createTestApp();
    db = made.db;
    const { cookie } = await signIn(made.app, "Ann");
    const headers = { cookie, origin: "https://evil.test" };

    const get = await made.app.request("/api/me", { headers });
    expect(get.status).toBe(200);

    const del = await made.app.request("/api/session", { method: "DELETE", headers });
    expect(del.status).toBe(403);
    expect(apiErrorSchema.parse(await del.json()).error.code).toBe("forbidden_origin");
    expect(await made.db.selectFrom("sessions").select("token_hash").execute()).toHaveLength(1);
  });

  test("covers routes added after createApp", async () => {
    const made = await createTestApp();
    db = made.db;
    const res = await made.app.request("/api/anything", {
      method: "PUT",
      headers: { origin: "https://evil.test" },
    });
    expect(res.status).toBe(403);
  });
});
