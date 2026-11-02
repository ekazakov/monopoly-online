import { applyAction } from "@monopoly/game-engine";
import type { Action, GameState } from "@monopoly/game-engine";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";

/** A snapshot is due every this many versions (see `shouldSnapshot`). */
export const SNAPSHOT_EVERY_N_VERSIONS = 50;

const DEFAULT_MAX_CACHED_GAMES = 200;

export interface SnapshotOptions {
  /** Defaults to `SNAPSHOT_EVERY_N_VERSIONS`. */
  everyNVersions?: number;
}

export interface GameStateLoaderOptions {
  /** Games kept in memory. The least recently used game is dropped first. */
  maxCachedGames?: number;
}

export interface GameStateLoader {
  /** The current committed state, or null while the game has no snapshot (still `waiting`). */
  load(gameId: string): Promise<GameState | null>;
  /** Cache a state. Call it only after the transaction that wrote this state has committed. */
  put(gameId: string, state: GameState): void;
  evict(gameId: string): void;
  clear(): void;
}

/**
 * The state is the full engine state, with `rng` and the decks: the server needs them to continue
 * the game. Only API responses are redacted (`redactState`).
 */
export function serializeState(state: GameState): string {
  return JSON.stringify(state);
}

export function deserializeState(text: string): GameState {
  const value: unknown = JSON.parse(text);
  if (
    typeof value !== "object" ||
    value === null ||
    !("version" in value) ||
    typeof value.version !== "number" ||
    !("players" in value) ||
    !Array.isArray(value.players) ||
    !("decks" in value) ||
    !("rng" in value)
  ) {
    throw new Error("Stored game state is not a game state");
  }
  return value as GameState;
}

/**
 * Whether the state after an accepted action must be saved as a snapshot (the D2 action endpoint
 * writes it in the same transaction as the events). True when:
 * - the turn starts: the engine has no turn counter, and a new turn is always given to another
 *   player (`advanceTurn` in `turnflow.ts`), so the turn starts exactly when
 *   `turn.currentPlayerId` differs from the previous state. A double does not start a turn: the
 *   same player rolls again. Or
 * - a multiple of N versions was reached or passed since `prev` (N defaults to
 *   `SNAPSHOT_EVERY_N_VERSIONS`).
 */
export function shouldSnapshot(
  prev: GameState,
  next: GameState,
  options: SnapshotOptions = {},
): boolean {
  const n = options.everyNVersions ?? SNAPSHOT_EVERY_N_VERSIONS;
  if (next.turn.currentPlayerId !== prev.turn.currentPlayerId) return true;
  return Math.floor(next.version / n) > Math.floor(prev.version / n);
}

export function createGameStateLoader(
  db: Kysely<Database>,
  options: GameStateLoaderOptions = {},
): GameStateLoader {
  const maxCached = options.maxCachedGames ?? DEFAULT_MAX_CACHED_GAMES;
  // A Map keeps insertion order, so the first key is the least recently used.
  const cache = new Map<string, GameState>();
  const loading = new Map<string, Promise<GameState | null>>();

  function remember(gameId: string, state: GameState) {
    cache.delete(gameId);
    cache.set(gameId, state);
    while (cache.size > maxCached) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }

  async function loadFromDb(gameId: string): Promise<GameState | null> {
    const snapshot = await db
      .selectFrom("game_snapshots")
      .select(["version", "state"])
      .where("game_id", "=", gameId)
      .orderBy("version", "desc")
      .limit(1)
      .executeTakeFirst();
    if (!snapshot) return null;

    let state = deserializeState(snapshot.state);
    if (state.version !== snapshot.version) {
      throw new Error(
        `Corrupt log for game ${gameId}: snapshot row has version ${snapshot.version}, its state has version ${state.version}`,
      );
    }

    const rows = await db
      .selectFrom("game_events")
      .select(["version", "action"])
      .where("game_id", "=", gameId)
      .where("version", ">", snapshot.version)
      .orderBy("version", "asc")
      .execute();

    for (const row of rows) {
      const action = JSON.parse(row.action) as Action;
      const result = applyAction(state, action);
      if (!result.ok) {
        throw new Error(
          `Corrupt log for game ${gameId}: event ${row.version} (${action.type}) is rejected: ${result.error.code}`,
        );
      }
      if (result.state.version !== row.version) {
        throw new Error(
          `Corrupt log for game ${gameId}: event row has version ${row.version}, replay reached version ${result.state.version}`,
        );
      }
      state = result.state;
    }
    return state;
  }

  async function loadAndCache(gameId: string): Promise<GameState | null> {
    const state = await loadFromDb(gameId);
    if (!state) return null;
    // A commit may have called `put` with a newer state while the rows were read.
    const cached = cache.get(gameId);
    if (cached && cached.version >= state.version) return cached;
    remember(gameId, state);
    return state;
  }

  return {
    async load(gameId) {
      const cached = cache.get(gameId);
      if (cached) {
        remember(gameId, cached);
        return cached;
      }
      // Callers that ask for the same game together share one replay.
      let pending = loading.get(gameId);
      if (!pending) {
        pending = loadAndCache(gameId).finally(() => loading.delete(gameId));
        loading.set(gameId, pending);
      }
      return pending;
    },
    put(gameId, state) {
      remember(gameId, state);
    },
    evict(gameId) {
      cache.delete(gameId);
    },
    clear() {
      cache.clear();
    },
  };
}
