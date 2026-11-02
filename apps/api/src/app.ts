import { OpenAPIHono } from "@hono/zod-openapi";
import type { Kysely } from "kysely";
import type { Database } from "./db/schema.ts";
import { errorHandler, notFoundHandler, validationHook } from "./errors.ts";
import { SESSION_COOKIE, resolveDeps, type AppEnv, type AppOptions } from "./routes/common.ts";
import { healthRoutes } from "./routes/health.ts";

export type { AppEnv, AppOptions } from "./routes/common.ts";

export function createApp(db: Kysely<Database>, options?: AppOptions) {
  const deps = resolveDeps(db, options);
  const app = new OpenAPIHono<AppEnv>({ defaultHook: validationHook })
    .basePath("/api")
    .notFound(notFoundHandler)
    .onError(errorHandler)
    .route("/", healthRoutes(deps));

  app.openAPIRegistry.registerComponent("securitySchemes", "sessionCookie", {
    type: "apiKey",
    in: "cookie",
    name: SESSION_COOKIE,
  });
  return app;
}

export type AppType = ReturnType<typeof createApp>;
