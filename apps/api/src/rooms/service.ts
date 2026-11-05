import { randomUUID } from "node:crypto";
import { createGame } from "@monopoly/game-engine";
import { MAX_SEATS, TOKENS, errorStatus } from "@monopoly/shared";
import type { ErrorCode, ErrorStatus, Game, RedactedGameState, User } from "@monopoly/shared";
import type { Kysely, Transaction } from "kysely";
import { nameKey } from "../auth/sessions.ts";
import type { Database, Game as GameRow, Seat as SeatRow } from "../db/schema.ts";
import { serializeState } from "../game/loader.ts";
import type { GameStateLoader } from "../game/loader.ts";
import { redactState } from "../game/redact.ts";

/** What the room service reports after a change has been committed. */
export type RoomEvent =
  | { type: "room.updated"; game: Game }
  | { type: "started"; game: Game; state: RedactedGameState };

/** A domain error with the shared API error code. The route maps it to the error body. */
export class RoomError extends Error {
  readonly status: ErrorStatus;
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "RoomError";
    this.code = code;
    this.status = errorStatus(code);
  }
}

export interface RoomServiceOptions {
  db: Kysely<Database>;
  now?: () => Date;
  /** Seed of the engine RNG for a new game. Defaults to a random 32-bit integer. */
  seed?: () => number;
  /** Called after the transaction of a join, leave, seat change or start has committed. */
  onRoomEvent?: (event: RoomEvent) => void;
  /** Gets the start state, so the first action does not replay it from the database. */
  loader?: GameStateLoader;
}

export interface RoomService {
  create(user: User, name: string): Promise<Game>;
  get(gameId: string): Promise<Game>;
  join(gameId: string, user: User): Promise<Game>;
  leave(gameId: string, user: User): Promise<Game>;
  addSeat(gameId: string, user: User, name: string): Promise<Game>;
  removeSeat(gameId: string, user: User, seatId: string): Promise<Game>;
  start(gameId: string, user: User): Promise<{ game: Game; state: RedactedGameState }>;
}

type Trx = Transaction<Database>;

export function toApiGame(game: GameRow, seats: SeatRow[]): Game {
  return {
    id: game.id,
    name: game.name,
    status: game.status,
    ownerId: game.owner_id,
    version: game.version,
    createdAt: game.created_at,
    seats: [...seats]
      .sort((a, b) => a.seat_order - b.seat_order)
      .map((seat) => ({
        id: seat.id,
        order: seat.seat_order,
        name: seat.name,
        kind: seat.kind,
        userId: seat.user_id,
        controllerUserId: seat.controller_user_id,
        token: seat.token,
      })),
    // Invites arrive with the Invites API (E). Until then no game has any.
    invites: [],
  };
}

// SQLite names the code, PostgreSQL uses 23505. The message check covers other drivers.
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code === "string" && (code.startsWith("SQLITE_CONSTRAINT") || code === "23505")) {
    return true;
  }
  return typeof message === "string" && /unique/i.test(message);
}

/**
 * Two requests can pass the same check together and meet at a unique index (the seat order or
 * the seat name). The loser then runs again: its checks see the winner's rows and answer with the
 * right 409 code. A second conflict is a real error.
 */
export async function withConflictRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return run();
  }
}

export function createRoomService(options: RoomServiceOptions): RoomService {
  const { db, onRoomEvent, loader } = options;
  const now = options.now ?? (() => new Date());
  const seed = options.seed ?? (() => crypto.getRandomValues(new Uint32Array(1))[0]!);

  function emit(event: RoomEvent) {
    // The change is committed. A failing listener must not turn it into an error response.
    try {
      onRoomEvent?.(event);
    } catch (error) {
      console.error("Room event listener failed", error);
    }
  }

  const loadGame = async (trx: Trx, gameId: string) => {
    const game = await trx
      .selectFrom("games")
      .selectAll()
      .where("id", "=", gameId)
      .executeTakeFirst();
    if (!game) throw new RoomError("not_found", "Game not found");
    return game;
  };

  const loadSeats = (trx: Trx, gameId: string) =>
    trx
      .selectFrom("seats")
      .selectAll()
      .where("game_id", "=", gameId)
      .orderBy("seat_order", "asc")
      .execute();

  const requireWaiting = (game: GameRow) => {
    if (game.status !== "waiting") throw new RoomError("game_not_waiting", "The game has started");
  };

  const requireRoom = (seats: SeatRow[], key: string) => {
    if (seats.length >= MAX_SEATS) throw new RoomError("game_full", "The game is full");
    if (seats.some((seat) => seat.name_key === key)) {
      throw new RoomError("seat_name_taken", "A seat in this game has this name");
    }
  };

  /** The first token of `TOKENS` that no seat has. A game has at most 6 seats, so one is free. */
  const freeToken = (seats: SeatRow[]) => {
    const taken = new Set(seats.map((seat) => seat.token));
    const token = TOKENS.find((candidate) => !taken.has(candidate));
    if (!token) throw new RoomError("game_full", "The game is full");
    return token;
  };

  const insertSeat = (
    trx: Trx,
    gameId: string,
    seats: SeatRow[],
    seat: { name: string; kind: "user" | "hotseat"; userId: string | null; controllerId: string },
  ) =>
    trx
      .insertInto("seats")
      .values({
        id: randomUUID(),
        game_id: gameId,
        // Orders are gapless, so the next one is the count plus one.
        seat_order: seats.length + 1,
        name: seat.name,
        name_key: nameKey(seat.name),
        kind: seat.kind,
        user_id: seat.userId,
        controller_user_id: seat.controllerId,
        token: freeToken(seats),
        created_at: now().toISOString(),
      })
      .execute();

  /** Runs `change` in a transaction and returns the room as it is after the change. */
  async function changeRoom(
    gameId: string,
    change: (trx: Trx, game: GameRow, seats: SeatRow[]) => Promise<void>,
  ): Promise<Game> {
    const game = await withConflictRetry(() =>
      db.transaction().execute(async (trx) => {
        const row = await loadGame(trx, gameId);
        await change(trx, row, await loadSeats(trx, gameId));
        return toApiGame(row, await loadSeats(trx, gameId));
      }),
    );
    emit({ type: "room.updated", game });
    return game;
  }

  return {
    async create(user, name) {
      return db.transaction().execute(async (trx) => {
        const time = now().toISOString();
        const game: GameRow = {
          id: randomUUID(),
          name,
          owner_id: user.id,
          status: "waiting",
          version: 0,
          created_at: time,
        };
        await trx.insertInto("games").values(game).execute();
        await insertSeat(trx, game.id, [], {
          name: user.name,
          kind: "user",
          userId: user.id,
          controllerId: user.id,
        });
        return toApiGame(game, await loadSeats(trx, game.id));
      });
    },

    async get(gameId) {
      const game = await db
        .selectFrom("games")
        .selectAll()
        .where("id", "=", gameId)
        .executeTakeFirst();
      if (!game) throw new RoomError("not_found", "Game not found");
      const seats = await db
        .selectFrom("seats")
        .selectAll()
        .where("game_id", "=", gameId)
        .execute();
      return toApiGame(game, seats);
    },

    join: (gameId, user) =>
      changeRoom(gameId, async (trx, game, seats) => {
        requireWaiting(game);
        if (seats.some((seat) => seat.kind === "user" && seat.user_id === user.id)) {
          throw new RoomError("already_joined", "You are already in this game");
        }
        requireRoom(seats, nameKey(user.name));
        await insertSeat(trx, gameId, seats, {
          name: user.name,
          kind: "user",
          userId: user.id,
          controllerId: user.id,
        });
      }),

    leave: (gameId, user) =>
      changeRoom(gameId, async (trx, game, seats) => {
        const own = seats.filter((seat) => seat.controller_user_id === user.id);
        if (own.length === 0) throw new RoomError("not_a_member", "You are not in this game");
        requireWaiting(game);
        if (game.owner_id === user.id) {
          throw new RoomError("owner_cannot_leave", "The owner cannot leave the game");
        }
        await removeSeats(
          trx,
          seats,
          own.map((seat) => seat.id),
        );
      }),

    addSeat: (gameId, user, name) =>
      changeRoom(gameId, async (trx, game, seats) => {
        if (!seats.some((seat) => seat.controller_user_id === user.id)) {
          throw new RoomError("not_a_member", "You are not in this game");
        }
        requireWaiting(game);
        requireRoom(seats, nameKey(name));
        await insertSeat(trx, gameId, seats, {
          name,
          kind: "hotseat",
          userId: null,
          controllerId: user.id,
        });
      }),

    removeSeat: (gameId, user, seatId) =>
      changeRoom(gameId, async (trx, game, seats) => {
        const seat = seats.find((s) => s.id === seatId);
        if (!seat) throw new RoomError("not_found", "Seat not found");
        if (!seats.some((s) => s.controller_user_id === user.id)) {
          throw new RoomError("not_a_member", "You are not in this game");
        }
        if (seat.controller_user_id !== user.id) {
          throw new RoomError("not_your_seat", "You do not control this seat");
        }
        requireWaiting(game);
        if (seat.kind === "user") {
          throw new RoomError("cannot_remove_user_seat", "Leave the game to remove this seat");
        }
        await removeSeats(trx, seats, [seat.id]);
      }),

    async start(gameId, user) {
      const result = await withConflictRetry(() =>
        db.transaction().execute(async (trx) => {
          const game = await loadGame(trx, gameId);
          if (game.owner_id !== user.id) {
            throw new RoomError("not_game_owner", "Only the owner can start the game");
          }
          requireWaiting(game);
          const seats = await loadSeats(trx, gameId);
          if (seats.length < 2) {
            throw new RoomError("not_enough_players", "At least two seats are needed");
          }
          const state = createGame({
            seed: seed(),
            players: seats.map((seat) => ({ id: seat.id, name: seat.name })),
          });
          // The status guard is the compare-and-swap that keeps a second start out.
          const updated = await trx
            .updateTable("games")
            .set({ status: "active", version: state.version })
            .where("id", "=", gameId)
            .where("status", "=", "waiting")
            .executeTakeFirst();
          if (updated.numUpdatedRows === 0n) {
            throw new RoomError("game_not_waiting", "The game has started");
          }
          await trx
            .insertInto("game_snapshots")
            .values({
              game_id: gameId,
              version: state.version,
              state: serializeState(state),
              turn_start: 1,
              created_at: now().toISOString(),
            })
            .execute();
          return {
            state,
            game: toApiGame({ ...game, status: "active", version: state.version }, seats),
          };
        }),
      );
      loader?.put(gameId, result.state);
      const redacted = redactState(result.state);
      emit({ type: "started", game: result.game, state: redacted });
      return { game: result.game, state: redacted };
    },
  };
}

/** Deletes the seats, then renumbers the rest from 1 in the same transaction. */
async function removeSeats(trx: Trx, seats: SeatRow[], removeIds: string[]) {
  await trx.deleteFrom("seats").where("id", "in", removeIds).execute();
  const kept = seats.filter((seat) => !removeIds.includes(seat.id));
  // Ascending order: a seat only moves to a number that a removed or an earlier seat freed.
  for (const [index, seat] of kept.entries()) {
    if (seat.seat_order === index + 1) continue;
    await trx
      .updateTable("seats")
      .set({ seat_order: index + 1 })
      .where("id", "=", seat.id)
      .execute();
  }
}
