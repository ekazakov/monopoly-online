import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { createDb } from "./client.ts";
import { migrateTo, migrateToLatest } from "./migrations.ts";
import type { Database } from "./schema.ts";

const U1 = "00000000-0000-4000-8000-000000000001";
const U2 = "00000000-0000-4000-8000-000000000002";
const G1 = "10000000-0000-4000-8000-000000000001";
const S1 = "20000000-0000-4000-8000-000000000001";
const S2 = "20000000-0000-4000-8000-000000000002";

describe("migrations", () => {
  let db: Kysely<Database>;

  beforeEach(async () => {
    db = createDb(":memory:");
    await migrateToLatest(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  async function addUsers() {
    await db
      .insertInto("users")
      .values([
        { id: U1, name: "Ann", name_key: "ann" },
        { id: U2, name: "Bob", name_key: "bob" },
      ])
      .execute();
  }

  async function addGame() {
    await addUsers();
    await db.insertInto("games").values({ id: G1, name: "Game", owner_id: U1 }).execute();
  }

  function seat(id: string, order: number, nameKey: string) {
    return {
      id,
      game_id: G1,
      seat_order: order,
      name: nameKey,
      name_key: nameKey,
      kind: "user" as const,
      user_id: U1,
      controller_user_id: U1,
    };
  }

  function event(version: number, clientActionId: string) {
    return {
      game_id: G1,
      version,
      client_action_id: clientActionId,
      seat_id: S1,
      action: "{}",
      events: "[]",
    };
  }

  async function count(table: "seats" | "game_events" | "game_snapshots") {
    const row = await db
      .selectFrom(table)
      .select((eb) => eb.fn.countAll<number>().as("n"))
      .executeTakeFirstOrThrow();
    return Number(row.n);
  }

  test("creates all tables", async () => {
    const rows = await sql<{ name: string }>`
      select name from sqlite_master where type = 'table' and name not like 'sqlite_%'
    `.execute(db);
    const names = rows.rows.map((r) => r.name);
    for (const table of ["users", "sessions", "games", "seats", "game_events", "game_snapshots"]) {
      expect(names).toContain(table);
    }
  });

  test("migrating twice is a no-op", async () => {
    await addGame();
    await migrateToLatest(db);
    expect(await db.selectFrom("games").selectAll().execute()).toHaveLength(1);
  });

  test("game defaults: status waiting, version 0", async () => {
    await addGame();
    const game = await db.selectFrom("games").selectAll().executeTakeFirstOrThrow();
    expect(game.status).toBe("waiting");
    expect(game.version).toBe(0);
    expect(game.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  test("rejects an unknown game status and seat kind", async () => {
    await addGame();
    await expect(
      db
        .insertInto("games")
        .values({ id: crypto.randomUUID(), name: "x", owner_id: U1, status: "bogus" as never })
        .execute(),
    ).rejects.toThrow(/CHECK/);
    await expect(
      db
        .insertInto("seats")
        .values({ ...seat(S1, 1, "ann"), kind: "bogus" as never })
        .execute(),
    ).rejects.toThrow(/CHECK/);
  });

  test("snapshot turn_start defaults to 0", async () => {
    await addGame();
    await db
      .insertInto("game_snapshots")
      .values({ game_id: G1, version: 0, state: "{}" })
      .execute();
    const row = await db.selectFrom("game_snapshots").selectAll().executeTakeFirstOrThrow();
    expect(row.turn_start).toBe(0);
  });

  describe("unique constraints", () => {
    test("user name_key", async () => {
      await addUsers();
      await expect(
        db
          .insertInto("users")
          .values({ id: crypto.randomUUID(), name: "ANN", name_key: "ann" })
          .execute(),
      ).rejects.toThrow(/UNIQUE/);
    });

    test("seat name_key per game", async () => {
      await addGame();
      await db
        .insertInto("seats")
        .values(seat(S1, 1, "ann"))
        .execute();
      await expect(
        db
          .insertInto("seats")
          .values(seat(S2, 2, "ann"))
          .execute(),
      ).rejects.toThrow(/UNIQUE/);
    });

    test("seat name_key may repeat in another game", async () => {
      await addGame();
      const g2 = crypto.randomUUID();
      await db.insertInto("games").values({ id: g2, name: "Two", owner_id: U1 }).execute();
      await db
        .insertInto("seats")
        .values(seat(S1, 1, "ann"))
        .execute();
      await db
        .insertInto("seats")
        .values({ ...seat(S2, 1, "ann"), game_id: g2 })
        .execute();
      expect(await count("seats")).toBe(2);
    });

    test("seat_order per game", async () => {
      await addGame();
      await db
        .insertInto("seats")
        .values(seat(S1, 1, "ann"))
        .execute();
      await expect(
        db
          .insertInto("seats")
          .values(seat(S2, 1, "bob"))
          .execute(),
      ).rejects.toThrow(/UNIQUE/);
    });

    test("event (game_id, version)", async () => {
      await addGame();
      await db
        .insertInto("seats")
        .values(seat(S1, 1, "ann"))
        .execute();
      await db.insertInto("game_events").values(event(1, "a")).execute();
      await expect(db.insertInto("game_events").values(event(1, "b")).execute()).rejects.toThrow(
        /UNIQUE/,
      );
    });

    test("event (game_id, client_action_id)", async () => {
      await addGame();
      await db
        .insertInto("seats")
        .values(seat(S1, 1, "ann"))
        .execute();
      await db.insertInto("game_events").values(event(1, "a")).execute();
      await expect(db.insertInto("game_events").values(event(2, "a")).execute()).rejects.toThrow(
        /UNIQUE/,
      );
    });

    test("snapshot (game_id, version)", async () => {
      await addGame();
      await db
        .insertInto("game_snapshots")
        .values({ game_id: G1, version: 0, state: "{}" })
        .execute();
      await expect(
        db.insertInto("game_snapshots").values({ game_id: G1, version: 0, state: "{}" }).execute(),
      ).rejects.toThrow(/UNIQUE|PRIMARY/);
    });
  });

  describe("0005_seat_tokens", () => {
    const G2 = "10000000-0000-4000-8000-000000000002";
    const NAMES = ["a", "b", "c", "d", "e", "f"];

    test("fills the token of seats that exist before the migration", async () => {
      const old = createDb(":memory:");
      try {
        await migrateTo(old, "0004_seats_events_snapshots");
        await old.insertInto("users").values({ id: U1, name: "Ann", name_key: "ann" }).execute();
        for (const id of [G1, G2]) {
          await old.insertInto("games").values({ id, name: "Game", owner_id: U1 }).execute();
        }
        // Two games with 6 and 2 seats. Rows from before the migration have no token column.
        const rows = [
          ...NAMES.map((name, i) => ({ game: G1, order: i + 1, name })),
          ...NAMES.slice(0, 2).map((name, i) => ({ game: G2, order: i + 1, name })),
        ];
        await old
          .insertInto("seats")
          .values(
            rows.map((r) => ({
              id: crypto.randomUUID(),
              game_id: r.game,
              seat_order: r.order,
              name: r.name,
              name_key: r.name,
              kind: "user" as const,
              user_id: U1,
              controller_user_id: U1,
            })) as never,
          )
          .execute();

        await migrateToLatest(old);

        const seats = await old
          .selectFrom("seats")
          .select(["game_id", "seat_order", "token"])
          .orderBy("game_id")
          .orderBy("seat_order")
          .execute();
        const tokens = ["dog", "cat", "penguin", "car", "horse", "duck"];
        expect(seats.filter((s) => s.game_id === G1).map((s) => s.token)).toEqual(tokens);
        expect(seats.filter((s) => s.game_id === G2).map((s) => s.token)).toEqual(
          tokens.slice(0, 2),
        );
      } finally {
        await old.destroy();
      }
    });

    test("a token is unique per game and may repeat in another game", async () => {
      await addGame();
      const g2 = crypto.randomUUID();
      await db.insertInto("games").values({ id: g2, name: "Two", owner_id: U1 }).execute();
      await db
        .insertInto("seats")
        .values({ ...seat(S1, 1, "ann"), token: "dog" })
        .execute();
      await expect(
        db
          .insertInto("seats")
          .values({ ...seat(S2, 2, "bob"), token: "dog" })
          .execute(),
      ).rejects.toThrow(/UNIQUE/);
      await db
        .insertInto("seats")
        .values({ ...seat(S2, 1, "ann"), game_id: g2, token: "dog" })
        .execute();
      expect(await count("seats")).toBe(2);
    });
  });

  describe("foreign keys", () => {
    test("a seat with a missing game fails", async () => {
      await addUsers();
      await expect(
        db
          .insertInto("seats")
          .values(seat(S1, 1, "ann"))
          .execute(),
      ).rejects.toThrow(/FOREIGN KEY/);
    });

    test("a game with a missing owner fails", async () => {
      await expect(
        db.insertInto("games").values({ id: G1, name: "Game", owner_id: U1 }).execute(),
      ).rejects.toThrow(/FOREIGN KEY/);
    });

    test("a session with a missing user fails", async () => {
      await expect(
        db
          .insertInto("sessions")
          .values({ token_hash: "h", user_id: U1, expires_at: "x", last_used_at: "x" })
          .execute(),
      ).rejects.toThrow(/FOREIGN KEY/);
    });

    test("deleting a game removes seats, events and snapshots", async () => {
      await addGame();
      await db
        .insertInto("seats")
        .values(seat(S1, 1, "ann"))
        .execute();
      await db.insertInto("game_events").values(event(1, "a")).execute();
      await db
        .insertInto("game_snapshots")
        .values({ game_id: G1, version: 0, state: "{}" })
        .execute();

      await db.deleteFrom("games").where("id", "=", G1).execute();

      expect(await count("seats")).toBe(0);
      expect(await count("game_events")).toBe(0);
      expect(await count("game_snapshots")).toBe(0);
    });
  });
});
