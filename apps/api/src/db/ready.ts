import type { ReadyChecks } from "@monopoly/shared";
import { type Kysely, sql } from "kysely";
import { pendingMigrations } from "./migrations.ts";
import type { Database } from "./schema.ts";

/**
 * The checks of `GET /api/ready`. It never throws: a failure is a value in the result, and the
 * text of the error stays out of it. The query must work, and no migration of this version may
 * be pending. When the first check fails the second cannot run, so it is `failed` too.
 */
export async function checkReadiness(db: Kysely<Database>): Promise<ReadyChecks> {
  try {
    await sql`select 1`.execute(db);
  } catch {
    return { database: "failed", migrations: "failed" };
  }
  try {
    const pending = await pendingMigrations(db);
    return { database: "ok", migrations: pending.length === 0 ? "ok" : "pending" };
  } catch {
    return { database: "ok", migrations: "failed" };
  }
}

export const isReady = (checks: ReadyChecks) =>
  checks.database === "ok" && checks.migrations === "ok";
