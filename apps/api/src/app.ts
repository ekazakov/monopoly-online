import { Hono } from "hono";
import type { Kysely } from "kysely";
import type { Database } from "./db/schema.ts";
import { errorHandler, notFoundHandler } from "./errors.ts";

export function createApp(_db: Kysely<Database>) {
  return new Hono()
    .basePath("/api")
    .notFound(notFoundHandler)
    .onError(errorHandler)
    .get("/health", (c) => c.json({ status: "ok" as const }));
}

export type AppType = ReturnType<typeof createApp>;
