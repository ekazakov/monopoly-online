import type { Game, RedactedGameState } from "@monopoly/shared";
import type { Kysely, Transaction } from "kysely";
import type { Database } from "../db/schema.ts";
import type { GameStateLoader } from "./loader.ts";
import { redactState } from "./redact.ts";
import { GameServiceError } from "./service.ts";
import type { GameService } from "./service.ts";

/** The new game and its state, for the `snapshot` that every device of the game gets. */
export interface LifecycleSnapshot {
  game: Game;
  state: RedactedGameState;
}

export interface LifecycleServiceOptions {
  db: Kysely<Database>;
  /** Does the rollback of the turn. */
  games: GameService;
  loader: GameStateLoader;
  /** The room as the API shows it: seats, claims and invites. */
  readGame: (gameId: string) => Promise<Game>;
  /** Called after the change has been committed. A failing subscriber does not fail the call. */
  onSnapshot?: (snapshot: LifecycleSnapshot) => void;
  /** Called after a claim. Only the room of the game hears of it: a saved game is not in the lobby. */
  onRoomUpdated?: (game: Game) => void;
  now?: () => Date;
  /** Called after a restore has been committed, before the `snapshot` goes out. */
  onRestored?: (game: Game) => void;
  /** Called after an `active` game has been saved, saved by itself or finished. */
  onLeftActive?: (gameId: string) => void;
}

/** Owner actions that end or pause a started game: Finish now, Save, Claim and Restore later. */
export interface LifecycleService {
  finish(input: { gameId: string; userId: string }): Promise<{ game: Game }>;
  /** A member claims the seats that they control. Only while the game is `saved`. */
  claim(input: { gameId: string; userId: string }): Promise<{ game: Game }>;
  /**
   * The automatic save when nobody is online. Not an owner action and on no route: the presence
   * tracker calls it. Does the work of `save` after it asks `stillUnattended` again, in the queue
   * of the game. Returns the saved game, or null when there was nothing to do.
   */
  saveUnattended(input: {
    gameId: string;
    stillUnattended: () => boolean | Promise<boolean>;
  }): Promise<{ game: Game } | null>;
  /** Owner only, `saved` only. Back to `active` with the same state, the owner's seats claimed. */
  restore(input: { gameId: string; userId: string }): Promise<{ game: Game }>;
  /** Owner only, `active` only. Rolls back to the start of the turn and clears all claims. */
  save(input: { gameId: string; userId: string }): Promise<{ game: Game }>;
}

export function createLifecycleService(options: LifecycleServiceOptions): LifecycleService {
  const { db, games, loader, readGame, onSnapshot, onRoomUpdated, onRestored, onLeftActive } =
    options;
  const now = options.now ?? (() => new Date());

  async function requireOwned(gameId: string, userId: string) {
    const game = await db
      .selectFrom("games")
      .select(["owner_id", "status"])
      .where("id", "=", gameId)
      .executeTakeFirst();
    if (!game) throw new GameServiceError("not_found", "Game not found");
    if (game.owner_id !== userId) {
      throw new GameServiceError("not_game_owner", "Only the owner can do this");
    }
    return game;
  }

  /** Read the new room and state, and tell the devices. */
  async function announce(gameId: string, before?: (game: Game) => void): Promise<Game> {
    const game = await readGame(gameId);
    const state = await loader.load(gameId);
    if (!state) throw new Error(`Game ${gameId} has no state`);
    // The change is committed. A failing subscriber must not turn it into an error.
    try {
      before?.(game);
    } catch (error) {
      console.error(error);
    }
    try {
      onSnapshot?.({ game, state: redactState(state) });
    } catch (error) {
      console.error(error);
    }
    return game;
  }

  /** The game left `active`: the presence of its players no longer matters. */
  const leftActive = (gameId: string) => (): void => onLeftActive?.(gameId);

  const clearClaims = (gameId: string) => async (trx: Transaction<Database>) => {
    await trx
      .updateTable("seats")
      .set({ claimed_at: null })
      .where("game_id", "=", gameId)
      .execute();
  };

  return {
    async saveUnattended({ gameId, stillUnattended }) {
      const saved = await games.saveUnattended({
        gameId,
        stillUnattended,
        // Same transaction: a saved game never shows a claim from before the save.
        inTransaction: clearClaims(gameId),
      });
      return saved ? { game: await announce(gameId, leftActive(gameId)) } : null;
    },

    async restore({ gameId, userId }) {
      const { status } = await requireOwned(gameId, userId);
      if (status !== "saved") {
        throw new GameServiceError("game_not_saved", "The game is not saved");
      }
      await db.transaction().execute(async (trx) => {
        // The state does not change, so the version stays. The guard keeps a second writer out.
        const updated = await trx
          .updateTable("games")
          .set({ status: "active" })
          .where("id", "=", gameId)
          .where("status", "=", "saved")
          .executeTakeFirst();
        if (Number(updated.numUpdatedRows) !== 1) {
          throw new GameServiceError("game_not_saved", "The game is not saved");
        }
        await trx
          .updateTable("seats")
          .set({ claimed_at: now().toISOString() })
          .where("game_id", "=", gameId)
          .where("controller_user_id", "=", userId)
          .where("claimed_at", "is", null)
          .execute();
      });
      return { game: await announce(gameId, (game) => onRestored?.(game)) };
    },

    async claim({ gameId, userId }) {
      const game = await db
        .selectFrom("games")
        .select("status")
        .where("id", "=", gameId)
        .executeTakeFirst();
      if (!game) throw new GameServiceError("not_found", "Game not found");
      const seat = await db
        .selectFrom("seats")
        .select("id")
        .where("game_id", "=", gameId)
        .where("controller_user_id", "=", userId)
        .limit(1)
        .executeTakeFirst();
      if (!seat) throw new GameServiceError("not_a_member", "You do not control a seat here");
      if (game.status !== "saved") {
        throw new GameServiceError("game_not_saved", "The game is not saved");
      }
      // The status guard in the same statement keeps a claim out of a game that was restored.
      await db
        .updateTable("seats")
        .set({ claimed_at: now().toISOString() })
        .where("game_id", "=", gameId)
        .where("controller_user_id", "=", userId)
        .where("claimed_at", "is", null)
        .where((eb) =>
          eb.exists(
            eb
              .selectFrom("games")
              .select("games.id")
              .where("games.id", "=", gameId)
              .where("games.status", "=", "saved"),
          ),
        )
        .execute();
      const current = await readGame(gameId);
      if (current.status !== "saved") {
        throw new GameServiceError("game_not_saved", "The game is not saved");
      }
      try {
        onRoomUpdated?.(current);
      } catch (error) {
        console.error(error);
      }
      return { game: current };
    },

    async save({ gameId, userId }) {
      const { status } = await requireOwned(gameId, userId);
      if (status !== "active") {
        throw new GameServiceError("game_not_active", "The game is not active");
      }
      await games.rollbackToTurnStart({
        gameId,
        status: "saved",
        inTransaction: clearClaims(gameId),
      });
      return { game: await announce(gameId, leftActive(gameId)) };
    },

    async finish({ gameId, userId }) {
      const { status } = await requireOwned(gameId, userId);
      if (status === "active") {
        await games.rollbackToTurnStart({ gameId, status: "finished" });
      } else if (status === "saved") {
        // The state does not change, so the version stays. The guard keeps a second writer out.
        const updated = await db
          .updateTable("games")
          .set({ status: "finished" })
          .where("id", "=", gameId)
          .where("status", "=", "saved")
          .executeTakeFirst();
        if (Number(updated.numUpdatedRows) !== 1) {
          throw new GameServiceError("game_not_active", "The game is not active");
        }
      } else {
        throw new GameServiceError("game_not_active", "The game is not active");
      }
      return { game: await announce(gameId, leftActive(gameId)) };
    },
  };
}
