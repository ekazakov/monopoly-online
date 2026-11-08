import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { apiErrorSchema } from "@monopoly/shared";
import type { Kysely } from "kysely";
import { createApp } from "./app.ts";
import { createDb } from "./db/client.ts";
import { migrateToLatest } from "./db/migrations.ts";
import type { Database } from "./db/schema.ts";
import { errorResponses, jsonBody, jsonResponse, type AppEnv } from "./routes/common.ts";

// A test-only route with a body and a query, to check the default validation hook.
const echoRoute = createRoute({
  method: "post",
  path: "/echo",
  request: {
    query: z.object({ n: z.coerce.number().int().optional() }),
    body: jsonBody(z.strictObject({ name: z.string().min(2) })),
  },
  responses: {
    200: jsonResponse("Echo", z.object({ name: z.string() })),
    ...errorResponses(400),
  },
});
const echoRoutes = new OpenAPIHono<AppEnv>().openapi(echoRoute, (c) =>
  c.json({ name: c.req.valid("json").name }, 200),
);

describe("api", () => {
  let db: Kysely<Database>;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    db = createDb(":memory:");
    await migrateToLatest(db);
    app = createApp(db, { auth: { guest: true } });
    app.route("/", echoRoutes);
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

  describe("validation", () => {
    const post = (body: string, headers: Record<string, string> = {}, path = "/api/echo") =>
      app.request(path, {
        method: "POST",
        body,
        headers: { "content-type": "application/json", ...headers },
      });

    test("a valid body passes", async () => {
      const res = await post(JSON.stringify({ name: "Ann" }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ name: "Ann" });
    });

    test("an invalid body returns validation_error with issues", async () => {
      const res = await post(JSON.stringify({ name: "A", extra: 1 }));
      expect(res.status).toBe(400);
      const body = apiErrorSchema.parse(await res.json());
      expect(body.error.code).toBe("validation_error");
      expect(body.error.message).toBe("Invalid request");
      expect(body.error.issues?.map((i) => i.path)).toEqual(expect.arrayContaining([["name"], []]));
    });

    test("an invalid query returns validation_error", async () => {
      const res = await post(JSON.stringify({ name: "Ann" }), {}, "/api/echo?n=abc");
      expect(res.status).toBe(400);
      const body = apiErrorSchema.parse(await res.json());
      expect(body.error.code).toBe("validation_error");
      expect(body.error.issues?.[0]?.path).toEqual(["n"]);
    });

    test("malformed JSON returns bad_request", async () => {
      const res = await post("{not json");
      expect(res.status).toBe(400);
      const body = apiErrorSchema.parse(await res.json());
      expect(body.error.code).toBe("bad_request");
      expect(body.error.issues).toBeUndefined();
    });

    test("a wrong content type returns bad_request", async () => {
      const res = await post("name=Ann", { "content-type": "text/plain" });
      expect(res.status).toBe(415);
      expect(apiErrorSchema.parse(await res.json()).error.code).toBe("bad_request");
    });
  });
});
