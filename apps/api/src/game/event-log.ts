import type { EventLogEntry, GameEvent } from "@monopoly/shared";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";

/**
 * The events of every accepted action of a game up to `toVersion`, oldest first. A rollback (Save
 * or Finish) deletes the rows of the discarded turn, so the rows always match the stored state.
 */
export async function readEventLog(
  db: Kysely<Database>,
  gameId: string,
  toVersion: number,
): Promise<EventLogEntry[]> {
  const rows = await db
    .selectFrom("game_events")
    .select(["version", "events"])
    .where("game_id", "=", gameId)
    .where("version", "<=", toVersion)
    .orderBy("version", "asc")
    .execute();
  return rows.map((row) => ({
    version: row.version,
    events: JSON.parse(row.events) as GameEvent[],
  }));
}
