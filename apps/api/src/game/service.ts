import { applyAction } from "@monopoly/game-engine";
import type { Action, GameState } from "@monopoly/game-engine";
import { errorStatus } from "@monopoly/shared";
import type {
  ActionInput,
  ErrorCode,
  ErrorStatus,
  GameEvent as ApiGameEvent,
  RedactedGameState,
} from "@monopoly/shared";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { serializeState, shouldSnapshot } from "./loader.ts";
import type { GameStateLoader, SnapshotOptions } from "./loader.ts";
import { redactState } from "./redact.ts";

/** A domain error with the shared API error code. The route maps it to the error body. */
export class GameServiceError extends Error {
  readonly status: ErrorStatus;
  readonly code: ErrorCode;
  /** Set with `version_conflict`: the version the server holds now. */
  readonly currentVersion?: number;

  constructor(code: ErrorCode, message: string, currentVersion?: number) {
    super(message);
    this.name = "GameServiceError";
    this.code = code;
    this.status = errorStatus(code);
    if (currentVersion !== undefined) this.currentVersion = currentVersion;
  }
}

export interface CommittedAction {
  gameId: string;
  events: ApiGameEvent[];
  state: RedactedGameState;
  version: number;
}

export interface GameServiceOptions {
  db: Kysely<Database>;
  loader: GameStateLoader;
  /** Clock for `created_at` of the rows the service writes. */
  now?: () => Date;
  /** Called after an action has been committed (the realtime layer publishes from here). */
  onCommitted?: (committed: CommittedAction) => void;
  snapshot?: SnapshotOptions;
}

export interface SubmitActionInput {
  gameId: string;
  userId: string;
  seatId: string;
  action: ActionInput;
  expectedVersion: number;
  clientActionId: string;
}

export interface ActionResult {
  version: number;
  events: ApiGameEvent[];
  state: RedactedGameState;
}

export interface StateResult {
  version: number;
  state: RedactedGameState;
}

export interface GameService {
  submitAction(input: SubmitActionInput): Promise<ActionResult>;
  getState(input: { gameId: string; userId: string }): Promise<StateResult>;
}

/** The compare-and-swap on `games.version` matched no row: another writer committed first. */
class LostRace extends Error {}

const notFound = (what: string) => new GameServiceError("not_found", `${what} not found`);

export function createGameService(options: GameServiceOptions): GameService {
  const { db, loader, onCommitted } = options;
  const now = options.now ?? (() => new Date());
  // The tail of the promise chain of each game with work in flight.
  const chains = new Map<string, Promise<void>>();

  /** Run tasks of one game one after another. A failed task does not stop the next one. */
  function serialise<T>(gameId: string, task: () => Promise<T>): Promise<T> {
    const previous = chains.get(gameId) ?? Promise.resolve();
    const run = previous.then(task);
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    chains.set(gameId, tail);
    void tail.then(() => {
      if (chains.get(gameId) === tail) chains.delete(gameId);
    });
    return run;
  }

  async function requireGame(gameId: string) {
    const game = await db
      .selectFrom("games")
      .select(["status", "version"])
      .where("id", "=", gameId)
      .executeTakeFirst();
    if (!game) throw notFound("Game");
    return game;
  }

  async function requireMember(gameId: string, userId: string) {
    const seat = await db
      .selectFrom("seats")
      .select("id")
      .where("game_id", "=", gameId)
      .where((eb) => eb.or([eb("user_id", "=", userId), eb("controller_user_id", "=", userId)]))
      .limit(1)
      .executeTakeFirst();
    if (!seat) throw new GameServiceError("not_a_member", "You are not seated in this game");
  }

  async function currentState(gameId: string): Promise<GameState> {
    const state = await loader.load(gameId);
    if (!state) throw new Error(`Game ${gameId} has no snapshot`);
    return state;
  }

  /** The stored answer to an earlier action with this id, with the current state. */
  async function storedResult(
    gameId: string,
    clientActionId: string,
  ): Promise<ActionResult | null> {
    const row = await db
      .selectFrom("game_events")
      .select(["version", "events"])
      .where("game_id", "=", gameId)
      .where("client_action_id", "=", clientActionId)
      .executeTakeFirst();
    if (!row) return null;
    const state = await currentState(gameId);
    return {
      version: row.version,
      events: JSON.parse(row.events) as ApiGameEvent[],
      state: redactState(state),
    };
  }

  async function commit(
    input: SubmitActionInput,
    action: Action,
    prev: GameState,
    next: GameState,
    events: readonly ApiGameEvent[],
  ): Promise<void> {
    const createdAt = now().toISOString();
    const ended = events.some((event) => event.type === "GameEnded");
    await db.transaction().execute(async (trx) => {
      const updated = await trx
        .updateTable("games")
        .set(ended ? { version: next.version, status: "finished" } : { version: next.version })
        .where("id", "=", input.gameId)
        .where("version", "=", prev.version)
        .where("status", "=", "active")
        .executeTakeFirst();
      if (Number(updated.numUpdatedRows) !== 1) throw new LostRace();

      await trx
        .insertInto("game_events")
        .values({
          game_id: input.gameId,
          version: next.version,
          client_action_id: input.clientActionId,
          seat_id: input.seatId,
          action: JSON.stringify(action),
          events: JSON.stringify(events),
          created_at: createdAt,
        })
        .execute();

      if (shouldSnapshot(prev, next, options.snapshot)) {
        await trx
          .insertInto("game_snapshots")
          .values({
            game_id: input.gameId,
            version: next.version,
            state: serializeState(next),
            turn_start: next.turn.currentPlayerId !== prev.turn.currentPlayerId ? 1 : 0,
            created_at: createdAt,
          })
          .execute();
      }
    });
  }

  /**
   * The transaction failed. When another writer won the race, answer as if this call had come
   * after it: the same `clientActionId` gives the stored result, a newer version gives a conflict.
   */
  async function recover(error: unknown, input: SubmitActionInput, prevVersion: number) {
    const stored = await storedResult(input.gameId, input.clientActionId);
    if (stored) return stored;
    const game = await db
      .selectFrom("games")
      .select(["status", "version"])
      .where("id", "=", input.gameId)
      .executeTakeFirst();
    if (game && game.version !== prevVersion) {
      throw new GameServiceError("version_conflict", "The game has changed", game.version);
    }
    if (game && game.status !== "active") {
      throw new GameServiceError("game_not_active", "The game is not active");
    }
    throw error;
  }

  async function submit(input: SubmitActionInput): Promise<ActionResult> {
    const { gameId, userId, seatId, clientActionId } = input;
    const game = await requireGame(gameId);
    await requireMember(gameId, userId);

    const seat = await db
      .selectFrom("seats")
      .select(["game_id", "controller_user_id"])
      .where("id", "=", seatId)
      .executeTakeFirst();
    if (!seat || seat.game_id !== gameId) throw notFound("Seat");
    if (seat.controller_user_id !== userId) {
      throw new GameServiceError("not_your_seat", "You do not control this seat");
    }

    // Before the status and version checks: a retry of an accepted action, also the one that
    // ended the game, gets its stored result.
    const stored = await storedResult(gameId, clientActionId);
    if (stored) return stored;

    if (game.status !== "active") {
      throw new GameServiceError("game_not_active", "The game is not active");
    }
    const prev = await currentState(gameId);
    if (input.expectedVersion !== prev.version) {
      throw new GameServiceError("version_conflict", "The game has changed", prev.version);
    }

    const action = { ...input.action, playerId: seatId } as Action;
    const result = applyAction(prev, action);
    if (!result.ok) throw new GameServiceError(result.error.code, result.error.message);

    const next = result.state;
    // The drift test in `packages/shared` keeps the wire event type equal to the engine's.
    const events = [...result.events] as ApiGameEvent[];
    try {
      await commit(input, action, prev, next, events);
    } catch (error) {
      loader.evict(gameId);
      return recover(error, input, prev.version);
    }
    loader.put(gameId, next);

    const state = redactState(next);
    try {
      onCommitted?.({ gameId, events, state, version: next.version });
    } catch (error) {
      // The action is committed. A failing subscriber must not turn it into an error.
      console.error(error);
    }
    return { version: next.version, events, state };
  }

  return {
    submitAction: (input) => serialise(input.gameId, () => submit(input)),

    async getState({ gameId, userId }) {
      const game = await requireGame(gameId);
      await requireMember(gameId, userId);
      if (game.status === "waiting") {
        throw new GameServiceError("game_not_active", "The game has not started");
      }
      const state = await currentState(gameId);
      return { version: state.version, state: redactState(state) };
    },
  };
}
