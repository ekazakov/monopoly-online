import SQLite from "better-sqlite3";
import { Kysely, SqliteDialect, type LogEvent } from "kysely";
import type { Database } from "./schema.ts";

export type DbOptions = {
  /** Called after each query, also a failed one. `index.ts` passes the tracing hook. */
  log?: (event: LogEvent) => void;
};

export function createDb(path: string, options: DbOptions = {}): Kysely<Database> {
  const sqlite = new SQLite(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return new Kysely<Database>({
    dialect: new SqliteDialect({ database: sqlite }),
    ...(options.log ? { log: options.log } : {}),
  });
}
