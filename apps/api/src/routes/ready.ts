import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { notReadyResponseSchema, readyResponseSchema } from "@monopoly/shared";
import { checkReadiness, isReady } from "../db/ready.ts";
import { jsonResponse, type AppDeps, type AppEnv } from "./common.ts";

const readyRoute = createRoute({
  method: "get",
  path: "/ready",
  tags: ["health"],
  summary: "Check that the API can serve requests",
  description:
    "Readiness, for the container health check. 200 when a database query works and every migration has run, else 503 with the failed checks. `GET /api/health` only says that the process runs. The body of the 503 is not an `ApiError`: a probe reads the status code. No sign-in is needed.",
  responses: {
    200: jsonResponse("The API is ready", readyResponseSchema),
    503: jsonResponse("The database or the migrations are not ready", notReadyResponseSchema),
  },
});

export function readyRoutes(deps: AppDeps) {
  return new OpenAPIHono<AppEnv>().openapi(readyRoute, async (c) => {
    const checks = await checkReadiness(deps.db);
    if (isReady(checks)) return c.json({ status: "ready" as const, checks }, 200);
    // The probe is the only line that says why. The body has the check names, not the error.
    c.get("log").warn({ checks }, "not ready");
    return c.json({ status: "not_ready" as const, checks }, 503);
  });
}
