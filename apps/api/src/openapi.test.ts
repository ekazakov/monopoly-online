import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vite-plus/test";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { Kysely } from "kysely";
import { createApp } from "./app.ts";
import type { Database } from "./db/schema.ts";
import { buildOpenApiDocument, renderOpenApiJson } from "./openapi.ts";
import { errorResponses, jsonResponse, sessionSecurity, type AppEnv } from "./routes/common.ts";

const app = createApp({} as Kysely<Database>);

describe("openapi", () => {
  test("openapi.json is up to date", async () => {
    const expected = await renderOpenApiJson(buildOpenApiDocument(app));
    const actual = await readFile(new URL("../openapi.json", import.meta.url), "utf8");
    expect(
      actual,
      "apps/api/openapi.json is stale. Run: node apps/api/scripts/generate-openapi.ts",
    ).toBe(expected);
  });

  test("the document is OpenAPI 3.1 and lists the routes under /api", () => {
    const doc = buildOpenApiDocument(app);
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info.title).toBe("Harborfront API");
    expect(Object.keys(doc.paths ?? {})).toEqual(
      expect.arrayContaining([
        "/api/health",
        "/api/session",
        "/api/me",
        "/api/games",
        "/api/games/{id}/actions",
        "/api/games/{id}/state",
        "/api/stream",
      ]),
    );
  });

  test("the stream is documented as text/event-stream with JSON errors", () => {
    const get = buildOpenApiDocument(app).paths?.["/api/stream"]?.get;
    expect(get?.responses?.["200"]).toMatchObject({
      content: { "text/event-stream": { schema: { type: "string" } } },
    });
    expect(Object.keys(get?.responses ?? {})).toEqual(["200", "400", "401", "403", "404", "500"]);
  });

  test("the document declares the session cookie scheme", () => {
    const scheme = buildOpenApiDocument(app).components?.securitySchemes?.sessionCookie;
    expect(scheme).toMatchObject({ type: "apiKey", in: "cookie" });
  });

  test("error responses and security are described", () => {
    const route = createRoute({
      method: "get",
      path: "/things",
      ...sessionSecurity,
      responses: {
        200: jsonResponse("Things", z.object({ ok: z.boolean() })),
        ...errorResponses(401, 404),
      },
    });
    const sub = new OpenAPIHono<AppEnv>().openapi(route, (c) => c.json({ ok: true }, 200));
    const doc = buildOpenApiDocument(createApp({} as Kysely<Database>).route("/", sub));
    const get = doc.paths?.["/api/things"]?.get;
    expect(get?.security).toEqual([{ sessionCookie: [] }]);
    expect(Object.keys(get?.responses ?? {})).toEqual(["200", "401", "404"]);
    expect(get?.responses?.["401"]).toMatchObject({
      content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } },
    });
    expect(doc.components?.schemas).toHaveProperty("ApiError");
  });
});
