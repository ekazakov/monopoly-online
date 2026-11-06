import type { Game, RedactedGameState } from "@monopoly/shared";
import type { Kysely } from "kysely";
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
}

/** Owner actions that end or pause a started game: Finish now, Save, Claim and Restore later. */
export interface LifecycleService {
  finish(input: { gameId: string; userId: string }): Promise<{ game: Game }>;
  /** Owner only, `active` only. Rolls back to the start of the turn and clears all claims. */
  save(input: { gameId: string; userId: string }): Promise<{ game: Game }>;
}

export function createLifecycleService(options: LifecycleServiceOptions): LifecycleService {
  const { db, games, loader, readGame, onSnapshot } = options;

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
  async function announce(gameId: string): Promise<Game> {
    const game = await readGame(gameId);
    const state = await loader.load(gameId);
    if (!state) throw new Error(`Game ${gameId} has no state`);
    try {
      onSnapshot?.({ game, state: redactState(state) });
    } catch (error) {
      // The change is committed. A failing subscriber must not turn it into an error.
      console.error(error);
    }
    return game;
  }

  return {
    async save({ gameId, userId }) {
      const { status } = await requireOwned(gameId, userId);
      if (status !== "active") {
        throw new GameServiceError("game_not_active", "The game is not active");
      }
      await games.rollbackToTurnStart({
        gameId,
        status: "saved",
        // Same transaction: a saved game never shows a claim from before the save.
        inTransaction: async (trx) => {
          await trx
            .updateTable("seats")
            .set({ claimed_at: null })
            .where("game_id", "=", gameId)
            .execute();
        },
      });
      return { game: await announce(gameId) };
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
      return { game: await announce(gameId) };
    },
  };
}
