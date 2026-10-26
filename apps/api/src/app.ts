import { zValidator } from "@hono/zod-validator";
import { createGameSchema } from "@monopoly/shared";
import { Hono } from "hono";
import type { Kysely } from "kysely";
import type { Database } from "./db/schema.ts";
import { errorHandler, notFoundHandler, validationHook } from "./errors.ts";

export function createApp(db: Kysely<Database>) {
  return new Hono()
    .basePath("/api")
    .notFound(notFoundHandler)
    .onError(errorHandler)
    .get("/health", (c) => c.json({ status: "ok" as const }))
    .get("/games", async (c) => {
      const games = await db
        .selectFrom("games")
        .selectAll()
        .orderBy("created_at", "desc")
        .execute();
      return c.json(games);
    })
    .post("/games", zValidator("json", createGameSchema, validationHook), async (c) => {
      const { name } = c.req.valid("json");
      const game = await db
        .insertInto("games")
        .values({ id: crypto.randomUUID(), name })
        .returningAll()
        .executeTakeFirstOrThrow();
      return c.json(game, 201);
    });
}

export type AppType = ReturnType<typeof createApp>;
