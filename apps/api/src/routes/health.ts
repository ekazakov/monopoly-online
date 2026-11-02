// How to add a route:
// 1. Create `routes/<area>.ts` that exports `<area>Routes(deps: AppDeps)` and returns `new OpenAPIHono<AppEnv>()` chained with `.openapi(route, handler)`.
// 2. Declare each route with `createRoute` (`jsonResponse`, `jsonBody` and `errorResponses` from `./common.ts`) and spread `sessionSecurity` when it needs the session.
// 3. Add `.route("/", <area>Routes(deps))` to the chain in `createApp` (`app.ts`), then run `node scripts/generate-openapi.ts`.
// Always give the status in `c.json(body, 200)` so the client types stay exact.
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { healthResponseSchema } from "@monopoly/shared";
import { jsonResponse, type AppDeps, type AppEnv } from "./common.ts";

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["health"],
  summary: "Check that the API runs",
  responses: { 200: jsonResponse("The API is up", healthResponseSchema) },
});

export function healthRoutes(_deps: AppDeps) {
  return new OpenAPIHono<AppEnv>().openapi(healthRoute, (c) =>
    c.json({ status: "ok" as const }, 200),
  );
}
