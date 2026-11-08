import { type Kysely, sql } from "kysely";
import { type Migration, Migrator } from "kysely/migration";
import type { Database } from "./schema.ts";
import { createSilentLogger, type Logger } from "../log.ts";

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
  "0005_seat_tokens": {
    // The order matters. A unique index created before the backfill would see only NULLs,
    // and one created on rows that repeat a value would fail.
    async up(db: Kysely<unknown>) {
      // Nullable: SQLite cannot add a NOT NULL column without a default.
      await db.schema.alterTable("seats").addColumn("token", "text").execute();
      // Seats before this migration took their token from the seat order. `seat_order`
      // is gapless from 1, so each seat of a game gets a different token.
      await sql`
        update seats set token = case seat_order
          when 1 then 'dog'
          when 2 then 'cat'
          when 3 then 'penguin'
          when 4 then 'car'
          when 5 then 'horse'
          when 6 then 'duck'
        end
      `.execute(db);
      await db.schema
        .createIndex("seats_game_id_token_unique")
        .unique()
        .on("seats")
        .columns(["game_id", "token"])
        .execute();
    },
    async down(db: Kysely<unknown>) {
      await db.schema.dropIndex("seats_game_id_token_unique").execute();
      await db.schema.alterTable("seats").dropColumn("token").execute();
    },
  },
  "0006_invites": {
    async up(db: Kysely<unknown>) {
      await db.schema
        .createTable("invites")
        .addColumn("id", "text", (col) => col.primaryKey())
        // An invite goes with its game: cancel deletes the game and the invites by cascade.
        .addColumn("game_id", "text", (col) =>
          col.notNull().references("games.id").onDelete("cascade"),
        )
        .addColumn("invited_user_id", "text", (col) => col.notNull().references("users.id"))
        .addColumn("invited_by_user_id", "text", (col) => col.notNull().references("users.id"))
        .addColumn("state", "text", (col) => col.notNull().defaultTo("pending"))
        .addColumn("created_at", "text", (col) => col.notNull().defaultTo(nowIso))
        .addColumn("updated_at", "text", (col) => col.notNull().defaultTo(nowIso))
        // One row for each invited user in a game. A new invite after a decline or an
        // expiry sets the same row back to pending.
        .addUniqueConstraint("invites_game_id_invited_user_id_unique", [
          "game_id",
          "invited_user_id",
        ])
        .addCheckConstraint(
          "invites_state_check",
          sql`state in ('pending', 'accepted', 'declined', 'expired')`,
        )
        .execute();
      // For the inbox of a user: the pending invites of one invitee.
      await db.schema
        .createIndex("invites_invited_user_id_state_idx")
        .on("invites")
        .columns(["invited_user_id", "state"])
        .execute();
    },
    async down(db: Kysely<unknown>) {
      await db.schema.dropTable("invites").execute();
    },
  },
  "0007_seat_claims": {
    async up(db: Kysely<unknown>) {
      // Nullable and with no default: a seat from before this migration is not claimed.
      // Only a `saved` game uses the value, so no backfill is needed.
      await db.schema.alterTable("seats").addColumn("claimed_at", "text").execute();
    },
    async down(db: Kysely<unknown>) {
      await db.schema.alterTable("seats").dropColumn("claimed_at").execute();
    },
  },
  "0008_auth_identities": {
    async up(db: Kysely<unknown>) {
      // One row per outside sign-in identity. Only the provider subject is kept: no email, no name
      // and no token. A guest user has no row.
      await db.schema
        .createTable("auth_identities")
        .addColumn("id", "text", (col) => col.primaryKey())
        .addColumn("provider", "text", (col) => col.notNull())
        .addColumn("subject", "text", (col) => col.notNull())
        .addColumn("user_id", "text", (col) =>
          col.notNull().references("users.id").onDelete("cascade"),
        )
        .addColumn("created_at", "text", (col) => col.notNull().defaultTo(nowIso))
        .execute();
      await db.schema
        .createIndex("auth_identities_provider_subject_idx")
        .on("auth_identities")
        .columns(["provider", "subject"])
        .unique()
        .execute();
      await db.schema
        .createIndex("auth_identities_user_id_idx")
        .on("auth_identities")
        .column("user_id")
        .execute();
    },
    async down(db: Kysely<unknown>) {
      await db.schema.dropTable("auth_identities").execute();
    },
  },
};

function createMigrator(db: Kysely<Database>): Migrator {
  return new Migrator({ db, provider: { getMigrations: async () => migrations } });
}

/** Runs the migrations up to `name`, and no further. For tests of a migration on old rows. */
export async function migrateTo(db: Kysely<Database>, name: string): Promise<void> {
  const { error } = await createMigrator(db).migrateTo(name);
  if (error) throw error;
}

/** `log` defaults to a silent logger. */
export async function migrateToLatest(
  db: Kysely<Database>,
  log: Logger = createSilentLogger(),
): Promise<void> {
  const migrator = createMigrator(db);
  const { error, results } = await migrator.migrateToLatest();
  for (const result of results ?? []) {
    if (result.status === "Error") {
      log.error({ migration: result.migrationName }, "migration failed");
    }
  }
  if (error) throw error;
}
