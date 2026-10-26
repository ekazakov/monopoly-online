import { type Kysely, sql } from "kysely";
import { type Migration, Migrator } from "kysely/migration";
import type { Database } from "./schema.ts";

// Migrations are inline, so they stay in the bundle after `vp pack`.
// Add new entries with a sortable key. Do not change entries that already ran.
const migrations: Record<string, Migration> = {
  "0001_games": {
    async up(db: Kysely<unknown>) {
      await db.schema
        .createTable("games")
        .addColumn("id", "text", (col) => col.primaryKey())
        .addColumn("name", "text", (col) => col.notNull())
        .addColumn("created_at", "text", (col) =>
          col.notNull().defaultTo(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
        )
        .execute();
    },
    async down(db: Kysely<unknown>) {
      await db.schema.dropTable("games").execute();
    },
  },
};

export async function migrateToLatest(db: Kysely<Database>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: { getMigrations: async () => migrations },
  });
  const { error, results } = await migrator.migrateToLatest();
  for (const result of results ?? []) {
    if (result.status === "Error") {
      console.error(`Migration "${result.migrationName}" failed`);
    }
  }
  if (error) throw error;
}
