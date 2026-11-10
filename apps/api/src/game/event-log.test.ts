import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { createDb } from "../db/client.ts";
import { migrateToLatest } from "../db/migrations.ts";
import type { Database } from "../db/schema.ts";
import { readEventLog } from "./event-log.ts";
import { GAME_ID, insertGame, insertSteps, playGame } from "./test-helpers.ts";

const game = playGame(2, 40);

describe("readEventLog", () => {
  let db: Kysely<Database>;

  beforeEach(async () => {
    db = createDb(":memory:");
    await migrateToLatest(db);
    await insertGame(db, game.initial);
    await insertSteps(db, game.steps);
  });

  afterEach(async () => {
    await db.destroy();
  });

  test("returns the events of every version up to the given version, oldest first", async () => {
    const log = await readEventLog(db, GAME_ID, 5);
    expect(log.map((entry) => entry.version)).toEqual([1, 2, 3, 4, 5]);
    for (const entry of log) {
      expect(entry.events).toEqual(game.steps[entry.version - 1]?.events);
    }
  });

  test("returns nothing for version 0, and every stored version for a large bound", async () => {
    expect(await readEventLog(db, GAME_ID, 0)).toEqual([]);
    const all = await readEventLog(db, GAME_ID, 10_000);
    expect(all).toHaveLength(game.steps.length);
  });

  test("reads only the rows of the given game", async () => {
    expect(await readEventLog(db, "00000000-0000-4000-8000-00000000dead", 10)).toEqual([]);
  });
});
