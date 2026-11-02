import { OpenAPIHono } from "@hono/zod-openapi";
import type { Kysely } from "kysely";
import type { Database } from "./db/schema.ts";
import { checkOrigin, parseOrigins } from "./auth/index.ts";
import { errorHandler, notFoundHandler, validationHook } from "./errors.ts";
import {
  SESSION_COOKIE,
  resolveDeps,
  type AppEnv,
  type AppOptions as BaseAppOptions,
} from "./routes/common.ts";
import { healthRoutes } from "./routes/health.ts";
import { sessionRoutes } from "./routes/session.ts";

export type { AppEnv } from "./routes/common.ts";

/** Optional settings of `createApp`. Tests set them; production uses the defaults. */
export type AppOptions = BaseAppOptions & {
  /** Extra origins that may send state-changing requests. Defaults to the `ALLOWED_ORIGINS` env comma list. */
  allowedOrigins?: string[];
};

export function createApp(db: Kysely<Database>, options?: AppOptions) {
  const deps = resolveDeps(db, options);
  const extraOrigins = options?.allowedOrigins ?? parseOrigins(process.env.ALLOWED_ORIGINS);
  const api = new OpenAPIHono<AppEnv>({ defaultHook: validationHook }).basePath("/api");
  // Registered before every route, so later routes are covered too. `.use` returns a plain
  // Hono type, so it stays out of the chain that keeps the OpenAPI types.
  api.use(checkOrigin({ extraOrigins, nodeEnv: deps.nodeEnv }));
  const app = api
    .notFound(notFoundHandler)
    .onError(errorHandler)
    .route("/", healthRoutes(deps))
    .route("/", sessionRoutes(deps));

  app.openAPIRegistry.registerComponent("securitySchemes", "sessionCookie", {
    type: "apiKey",
    in: "cookie",
    name: SESSION_COOKIE,
  });
  return app;
}

export type AppType = ReturnType<typeof createApp>;
