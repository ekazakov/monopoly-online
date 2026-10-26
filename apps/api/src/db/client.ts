import SQLite from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import type { Database } from "./schema.ts";

export function createDb(path: string): Kysely<Database> {
  const sqlite = new SQLite(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return new Kysely<Database>({ dialect: new SqliteDialect({ database: sqlite }) });
}
