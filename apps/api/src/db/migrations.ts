import { type Kysely, sql } from "kysely";
import { type Migration, Migrator } from "kysely/migration";
import type { Database } from "./schema.ts";

const nowIso = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

// Migrations are inline, so they stay in the bundle after `vp pack`.
// Add new entries with a sortable key. Do not change entries that already ran.
const migrations: Record<string, Migration> = {
  "0001_games": {
    async up(db: Kysely<unknown>) {
      await db.schema
        .createTable("games")
        .addColumn("id", "text", (col) => col.primaryKey())
        .addColumn("name", "text", (col) => col.notNull())
        .addColumn("created_at", "text", (col) => col.notNull().defaultTo(nowIso))
        .execute();
    },
    async down(db: Kysely<unknown>) {
      await db.schema.dropTable("games").execute();
    },
  },
  "0002_users_sessions": {
    async up(db: Kysely<unknown>) {
      await db.schema
        .createTable("users")
        .addColumn("id", "text", (col) => col.primaryKey())
        .addColumn("name", "text", (col) => col.notNull())
        // Lower-cased name. A plain unique index keeps case-insensitive names portable.
        .addColumn("name_key", "text", (col) => col.notNull().unique())
        .addColumn("created_at", "text", (col) => col.notNull().defaultTo(nowIso))
        .execute();
      await db.schema
        .createTable("sessions")
        // Only the hash of the session token is stored.
        .addColumn("token_hash", "text", (col) => col.primaryKey())
        .addColumn("user_id", "text", (col) =>
          col.notNull().references("users.id").onDelete("cascade"),
        )
        .addColumn("expires_at", "text", (col) => col.notNull())
        .addColumn("last_used_at", "text", (col) => col.notNull())
        .addColumn("created_at", "text", (col) => col.notNull().defaultTo(nowIso))
        .execute();
      await db.schema
        .createIndex("sessions_user_id_idx")
        .on("sessions")
        .column("user_id")
        .execute();
    },
    async down(db: Kysely<unknown>) {
      await db.schema.dropTable("sessions").execute();
      await db.schema.dropTable("users").execute();
    },
  },
  "0003_games_owner": {
    // SQLite cannot add a NOT NULL column without a default, and owner_id has no
    // valid default. The table holds no real data, so drop it and create it again.
    async up(db: Kysely<unknown>) {
      await db.schema.dropTable("games").execute();
      await db.schema
        .createTable("games")
        .addColumn("id", "text", (col) => col.primaryKey())
        .addColumn("name", "text", (col) => col.notNull())
        .addColumn("owner_id", "text", (col) => col.notNull().references("users.id"))
        .addColumn("status", "text", (col) => col.notNull().defaultTo("waiting"))
        .addColumn("version", "integer", (col) => col.notNull().defaultTo(0))
        .addColumn("created_at", "text", (col) => col.notNull().defaultTo(nowIso))
        .addCheckConstraint(
          "games_status_check",
          sql`status in ('waiting', 'active', 'saved', 'finished')`,
        )
        .execute();
      await db.schema.createIndex("games_status_idx").on("games").column("status").execute();
    },
    async down(db: Kysely<unknown>) {
      await db.schema.dropTable("games").execute();
      await db.schema
        .createTable("games")
        .addColumn("id", "text", (col) => col.primaryKey())
        .addColumn("name", "text", (col) => col.notNull())
        .addColumn("created_at", "text", (col) => col.notNull().defaultTo(nowIso))
        .execute();
    },
  },
  "0004_seats_events_snapshots": {
    async up(db: Kysely<unknown>) {
      await db.schema
        .createTable("seats")
        // The seat id is also the engine player id.
        .addColumn("id", "text", (col) => col.primaryKey())
        .addColumn("game_id", "text", (col) =>
          col.notNull().references("games.id").onDelete("cascade"),
        )
        // "order" is a reserved word, so the column is seat_order.
        .addColumn("seat_order", "integer", (col) => col.notNull())
        .addColumn("name", "text", (col) => col.notNull())
        .addColumn("name_key", "text", (col) => col.notNull())
        .addColumn("kind", "text", (col) => col.notNull())
        // Null for a hot-seat seat.
        .addColumn("user_id", "text", (col) => col.references("users.id"))
        .addColumn("controller_user_id", "text", (col) => col.notNull().references("users.id"))
        .addColumn("created_at", "text", (col) => col.notNull().defaultTo(nowIso))
        .addUniqueConstraint("seats_game_id_seat_order_unique", ["game_id", "seat_order"])
        .addUniqueConstraint("seats_game_id_name_key_unique", ["game_id", "name_key"])
        .addCheckConstraint("seats_kind_check", sql`kind in ('user', 'hotseat')`)
        .execute();
      await db.schema.createIndex("seats_user_id_idx").on("seats").column("user_id").execute();

      // The unique (game_id, version) constraint is also the index for event replay.
      await db.schema
        .createTable("game_events")
        .addColumn("game_id", "text", (col) =>
          col.notNull().references("games.id").onDelete("cascade"),
        )
        .addColumn("version", "integer", (col) => col.notNull())
        .addColumn("client_action_id", "text", (col) => col.notNull())
        .addColumn("seat_id", "text", (col) => col.notNull().references("seats.id"))
        .addColumn("action", "text", (col) => col.notNull())
        .addColumn("events", "text", (col) => col.notNull())
        .addColumn("created_at", "text", (col) => col.notNull().defaultTo(nowIso))
        .addPrimaryKeyConstraint("game_events_pk", ["game_id", "version"])
        .addUniqueConstraint("game_events_game_id_client_action_id_unique", [
          "game_id",
          "client_action_id",
        ])
        .execute();

      await db.schema
        .createTable("game_snapshots")
        .addColumn("game_id", "text", (col) =>
          col.notNull().references("games.id").onDelete("cascade"),
        )
        .addColumn("version", "integer", (col) => col.notNull())
        .addColumn("state", "text", (col) => col.notNull())
        .addColumn("turn_start", "integer", (col) => col.notNull().defaultTo(0))
        .addColumn("created_at", "text", (col) => col.notNull().defaultTo(nowIso))
        .addPrimaryKeyConstraint("game_snapshots_pk", ["game_id", "version"])
        .addCheckConstraint("game_snapshots_turn_start_check", sql`turn_start in (0, 1)`)
        .execute();
      // For "latest snapshot of a game" (and the latest turn start) lookups.
      await sql`create index game_snapshots_game_id_version_desc_idx on game_snapshots (game_id, version desc)`.execute(
        db,
      );
    },
    async down(db: Kysely<unknown>) {
      await db.schema.dropTable("game_snapshots").execute();
      await db.schema.dropTable("game_events").execute();
      await db.schema.dropTable("seats").execute();
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
