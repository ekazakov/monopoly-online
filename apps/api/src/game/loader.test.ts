import { applyAction } from "@monopoly/game-engine";
import type { GameState } from "@monopoly/game-engine";
import type { Kysely, KyselyPlugin } from "kysely";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { createDb } from "../db/client.ts";
import { migrateToLatest } from "../db/migrations.ts";
import type { Database } from "../db/schema.ts";
import {
  createGameStateLoader,
  deserializeState,
  serializeState,
  shouldSnapshot,
  SNAPSHOT_EVERY_N_VERSIONS,
} from "./loader.ts";
import {
  GAME_ID,
  insertGame,
  insertSnapshot,
  insertSteps,
  playGame,
  type PlayedGame,
} from "./test-helpers.ts";

const game: PlayedGame = playGame(2, 400);
const last = (played: PlayedGame) => played.steps[played.steps.length - 1]?.state as GameState;

describe("serializeState", () => {
  test("keeps rng and the decks", () => {
    const text = serializeState(game.initial);
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(parsed).toHaveProperty("rng");
    expect(parsed).toHaveProperty("decks");
    expect(deserializeState(text)).toEqual(game.initial);
  });

  test("a restored state continues the game with the same events", () => {
    const cut = 120;
    expect(game.steps.length).toBeGreaterThan(cut);
    const restored = deserializeState(serializeState(game.steps[cut - 1]?.state as GameState));
    let state = restored;
    for (const step of game.steps.slice(cut)) {
      const result = applyAction(state, step.action);
      if (!result.ok) throw new Error(result.error.code);
      expect(result.events).toEqual(step.events);
      expect(result.state).toEqual(step.state);
      state = result.state;
    }
  });

  test("refuses text that is not a game state", () => {
    expect(() => deserializeState("{}")).toThrow(/not a game state/);
    expect(() => deserializeState("[1]")).toThrow(/not a game state/);
    expect(() => deserializeState("null")).toThrow(/not a game state/);
    expect(() => deserializeState("nope")).toThrow(/JSON/);
  });
});

describe("shouldSnapshot", () => {
  const at = (version: number, currentPlayerId = "seat-a"): GameState => ({
    ...game.initial,
    version,
    turn: { ...game.initial.turn, currentPlayerId },
  });

  test("exports N = 50", () => {
    expect(SNAPSHOT_EVERY_N_VERSIONS).toBe(50);
  });

  test("is true when the active player changes", () => {
    expect(shouldSnapshot(at(3, "seat-a"), at(4, "seat-b"))).toBe(true);
  });

  test("is false inside a turn", () => {
    expect(shouldSnapshot(at(3), at(4))).toBe(false);
  });

  test("is true when a multiple of N is reached or passed", () => {
    expect(shouldSnapshot(at(49), at(50))).toBe(true);
    expect(shouldSnapshot(at(50), at(51))).toBe(false);
    expect(shouldSnapshot(at(99), at(100))).toBe(true);
    expect(shouldSnapshot(at(48), at(51))).toBe(true);
    expect(shouldSnapshot(at(4), at(5), { everyNVersions: 5 })).toBe(true);
    expect(shouldSnapshot(at(5), at(6), { everyNVersions: 5 })).toBe(false);
  });

  test("in a played game it is true exactly at turn starts and multiples of N", () => {
    let turnStarts = 0;
    let prev = game.initial;
    for (const step of game.steps) {
      const turnStart = step.state.turn.currentPlayerId !== prev.turn.currentPlayerId;
      const events = step.events.map((e) => e.type);
      // The engine ends a turn with one TurnEnded event, and with no other event type.
      expect(turnStart).toBe(events.includes("TurnEnded"));
      expect(shouldSnapshot(prev, step.state)).toBe(turnStart || step.state.version % 50 === 0);
      if (turnStart) turnStarts++;
      prev = step.state;
    }
    expect(turnStarts).toBeGreaterThan(5);
  });
});

describe("GameStateLoader", () => {
  let db: Kysely<Database>;
  let queries: number;

  const counter: KyselyPlugin = {
    transformQuery({ node }) {
      queries++;
      return node;
    },
    transformResult: async ({ result }) => result,
  };

  beforeEach(async () => {
    db = createDb(":memory:");
    await migrateToLatest(db);
    await insertGame(db, game.initial);
    queries = 0;
  });

  afterEach(async () => {
    await db.destroy();
  });

  const loaderFor = () => createGameStateLoader(db.withPlugin(counter));

  test("returns null while the game has no snapshot", async () => {
    expect(await loaderFor().load(GAME_ID)).toBeNull();
  });

  test("returns null for an unknown game", async () => {
    expect(await loaderFor().load("10000000-0000-4000-8000-0000000000ff")).toBeNull();
  });

  test("loads a snapshot without events", async () => {
    const mid = game.steps[59]?.state as GameState;
    await insertSnapshot(db, mid);
    expect(await loaderFor().load(GAME_ID)).toEqual(mid);
  });

  test("loads the full engine state, with rng and decks", async () => {
    await insertSnapshot(db, game.initial);
    const state = await loaderFor().load(GAME_ID);
    expect(state?.rng).toEqual(game.initial.rng);
    expect(state?.decks).toEqual(game.initial.decks);
  });

  test("replays the events after the snapshot to the live state", async () => {
    await insertSnapshot(db, game.initial);
    await insertSteps(db, game.steps);
    expect(await loaderFor().load(GAME_ID)).toEqual(last(game));
  });

  test("replays only the events after a middle snapshot", async () => {
    await insertSnapshot(db, game.steps[99]?.state as GameState);
    await insertSteps(db, game.steps);
    expect(await loaderFor().load(GAME_ID)).toEqual(last(game));
  });

  test("uses the latest of several snapshots", async () => {
    await insertSnapshot(db, game.initial);
    await insertSnapshot(db, game.steps[49]?.state as GameState);
    await insertSnapshot(db, game.steps[149]?.state as GameState);
    await insertSteps(db, game.steps);
    // Events at or before the latest snapshot are not read. A damaged one proves it.
    await db
      .updateTable("game_events")
      .set({ action: "not json" })
      .where("version", "<=", 150)
      .execute();
    expect(await loaderFor().load(GAME_ID)).toEqual(last(game));
  });

  test("a hit in the cache needs no query", async () => {
    await insertSnapshot(db, game.initial);
    await insertSteps(db, game.steps);
    const loader = loaderFor();
    const first = await loader.load(GAME_ID);
    expect(queries).toBe(2);
    expect(await loader.load(GAME_ID)).toBe(first);
    expect(queries).toBe(2);
  });

  test("callers that ask together share one replay", async () => {
    await insertSnapshot(db, game.initial);
    await insertSteps(db, game.steps);
    const loader = loaderFor();
    const [a, b] = await Promise.all([loader.load(GAME_ID), loader.load(GAME_ID)]);
    expect(a).toBe(b);
    expect(queries).toBe(2);
  });

  test("put replaces the cached state, evict and clear drop it", async () => {
    await insertSnapshot(db, game.initial);
    await insertSteps(db, game.steps);
    const loader = loaderFor();
    const mid = game.steps[9]?.state as GameState;
    loader.put(GAME_ID, mid);
    expect(await loader.load(GAME_ID)).toBe(mid);
    expect(queries).toBe(0);

    loader.evict(GAME_ID);
    expect(await loader.load(GAME_ID)).toEqual(last(game));
    expect(queries).toBe(2);

    loader.clear();
    expect(await loader.load(GAME_ID)).toEqual(last(game));
    expect(queries).toBe(4);
  });

  test("a waiting game is not cached", async () => {
    const loader = loaderFor();
    expect(await loader.load(GAME_ID)).toBeNull();
    await insertSnapshot(db, game.initial);
    expect(await loader.load(GAME_ID)).toEqual(game.initial);
  });

  test("drops the least recently used game over the cache limit", async () => {
    await insertSnapshot(db, game.initial);
    const loader = createGameStateLoader(db.withPlugin(counter), { maxCachedGames: 2 });
    loader.put("g1", game.initial);
    loader.put("g2", game.initial);
    loader.put("g3", game.initial);
    expect(await loader.load("g3")).toBe(game.initial);
    expect(await loader.load("g2")).toBe(game.initial);
    expect(queries).toBe(0);
    // "g1" was dropped, so this asks the database.
    expect(await loader.load("g1")).toBeNull();
    expect(queries).toBe(1);
  });

  describe("a corrupt log", () => {
    test("a missing event row", async () => {
      await insertSnapshot(db, game.initial);
      await insertSteps(db, game.steps);
      await db.deleteFrom("game_events").where("version", "=", 3).execute();
      await expect(loaderFor().load(GAME_ID)).rejects.toThrow(/Corrupt log/);
    });

    test("an event row with the wrong version", async () => {
      await insertSnapshot(db, game.initial);
      await insertSteps(db, game.steps.slice(0, 5));
      await db.updateTable("game_events").set({ version: 9 }).where("version", "=", 5).execute();
      await expect(loaderFor().load(GAME_ID)).rejects.toThrow(
        /Corrupt log.*event row has version 9, replay reached version 5/,
      );
    });

    test("an action that the engine rejects", async () => {
      await insertSnapshot(db, game.initial);
      await insertSteps(db, game.steps.slice(0, 3));
      await db
        .updateTable("game_events")
        .set({ action: JSON.stringify({ type: "EndTurn", playerId: "seat-a" }) })
        .where("version", "=", 1)
        .execute();
      await expect(loaderFor().load(GAME_ID)).rejects.toThrow(
        /Corrupt log.*event 1 \(EndTurn\) is rejected/,
      );
    });

    test("a snapshot row whose state has another version", async () => {
      await db
        .insertInto("game_snapshots")
        .values({ game_id: GAME_ID, version: 7, state: serializeState(game.initial) })
        .execute();
      await expect(loaderFor().load(GAME_ID)).rejects.toThrow(/Corrupt log/);
    });

    test("is not cached", async () => {
      await insertSnapshot(db, game.initial);
      await insertSteps(db, game.steps.slice(0, 5));
      await db.deleteFrom("game_events").where("version", "=", 2).execute();
      const loader = loaderFor();
      await expect(loader.load(GAME_ID)).rejects.toThrow(/Corrupt log/);
      await expect(loader.load(GAME_ID)).rejects.toThrow(/Corrupt log/);
    });
  });
});
