import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ApiErrorBody } from "@monopoly/shared";
import { hc } from "hono/client";
import { describe, expect, expectTypeOf, test } from "vite-plus/test";
import type { AppType } from "./app.ts";
import { errorResponses, jsonResponse, type AppEnv } from "./routes/common.ts";

// Type-level checks: the hc client must keep the response types of OpenAPIHono routes.
describe("hc client types", () => {
  test("health body is { status: 'ok' }", async () => {
    const client = hc<AppType>("/");
    type Res = Awaited<ReturnType<typeof client.api.health.$get>>;
    type Body = Awaited<ReturnType<Res["json"]>>;
    expectTypeOf<Body>().toEqualTypeOf<{ status: "ok" }>();
    expectTypeOf<Res["status"]>().toEqualTypeOf<200>();
  });

  test("ready body is ready or not_ready, by status", async () => {
    const client = hc<AppType>("/");
    type Res = Awaited<ReturnType<typeof client.api.ready.$get>>;
    expectTypeOf<Res["status"]>().toEqualTypeOf<200 | 503>();
    type Body = Awaited<ReturnType<Res["json"]>>;
    expectTypeOf<Body["status"]>().toEqualTypeOf<"ready" | "not_ready">();
  });

  test("error responses keep their status and body types", async () => {
    const route = createRoute({
      method: "get",
      path: "/thing",
      responses: {
        200: jsonResponse("Thing", z.object({ id: z.string() })),
        ...errorResponses(401, 404),
      },
    });
    const sub = new OpenAPIHono<AppEnv>().openapi(route, (c) =>
      c.req.query("fail")
        ? c.json({ error: { code: "not_found" as const, message: "no" } }, 404)
        : c.json({ id: "1" }, 200),
    );
    const client = hc<typeof sub>("http://localhost", {
      fetch: (input: Request | string | URL, init?: RequestInit) => sub.request(input, init),
    });
    const res = await client.thing.$get();

    expect(res.status).toBe(200);
    expectTypeOf(res.status).toEqualTypeOf<200 | 401 | 404>();
    if (res.status === 404) {
      expectTypeOf(await res.json()).toEqualTypeOf<ApiErrorBody>();
    } else if (res.status === 200) {
      expectTypeOf(await res.json()).toEqualTypeOf<{ id: string }>();
    }
  });
});
