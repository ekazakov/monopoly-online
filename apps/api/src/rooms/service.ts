import { randomUUID } from "node:crypto";
import { createGame } from "@monopoly/game-engine";
import { MAX_SEATS, TOKENS, errorStatus } from "@monopoly/shared";
import type {
  ErrorCode,
  ErrorStatus,
  Game,
  Invite,
  LobbyGame,
  RoomInvite,
  RedactedGameState,
  Token,
  User,
} from "@monopoly/shared";
import type { Kysely, Transaction } from "kysely";
import { nameKey } from "../auth/sessions.ts";
import type { Database, Game as GameRow, Seat as SeatRow } from "../db/schema.ts";
import { serializeState } from "../game/loader.ts";
import type { GameStateLoader } from "../game/loader.ts";
import { redactState } from "../game/redact.ts";

/** What the room service reports after a change has been committed. */
export type RoomEvent =
  /** A game was created. Nobody watches its room yet, so only the lobby hears of it. */
  | { type: "room.created"; lobby: LobbyGame }
  | { type: "room.updated"; game: Game; lobby: LobbyGame }
  | { type: "room.cancelled"; gameId: string }
  /** The host removed `userId` from a waiting game. Only that user hears it. */
  | { type: "room.removed"; gameId: string; userId: string }
  /** The pending invites of one user changed. `invites` is the full list after the change. */
  | { type: "invites.updated"; userId: string; invites: Invite[] }
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
  /** The `waiting` games, newest first, at most `OPEN_GAMES_LIMIT`. Full games stay in. */
  listOpen(): Promise<LobbyGame[]>;
  /** The `waiting` and `active` games where the user has a seat or controls a hot-seat seat. */
  listMine(user: User): Promise<LobbyGame[]>;
  join(gameId: string, user: User): Promise<Game>;
  leave(gameId: string, user: User): Promise<Game>;
  addSeat(gameId: string, user: User, name: string): Promise<Game>;
  removeSeat(gameId: string, user: User, seatId: string): Promise<Game>;
  changeToken(gameId: string, user: User, seatId: string, token: Token): Promise<Game>;
  /** Host only: removes the seats that `userId` controls, hot-seat seats included. */
  removePlayer(gameId: string, host: User, userId: string): Promise<Game>;
  cancel(gameId: string, user: User): Promise<void>;
  /** The host invites a user by name. The invite does not hold a seat. */
  invite(gameId: string, user: User, name: string): Promise<Game>;
  /** The pending invites of the user, newest first. */
  listInvites(user: User): Promise<Invite[]>;
  /** Joins the game and sets the invite to `accepted` in one transaction. */
  acceptInvite(inviteId: string, user: User): Promise<Game>;
  declineInvite(inviteId: string, user: User): Promise<void>;
  start(gameId: string, user: User): Promise<{ game: Game; state: RedactedGameState }>;
}

type Trx = Transaction<Database>;

/** The most games the open list returns. */
export const OPEN_GAMES_LIMIT = 50;

/** One lobby row. `seats` are the seats of this game only. */
export function toLobbyGame(game: GameRow & { owner_name: string }, seats: SeatRow[]): LobbyGame {
  const ordered = [...seats].sort((a, b) => a.seat_order - b.seat_order);
  return {
    id: game.id,
    name: game.name,
    ownerId: game.owner_id,
    ownerName: game.owner_name,
    status: game.status,
    seatCount: ordered.length,
    tokens: ordered.map((seat) => seat.token),
    createdAt: game.created_at,
  };
}

export function toApiGame(game: GameRow, seats: SeatRow[], invites: RoomInvite[] = []): Game {
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
        claimed: seat.claimed_at !== null,
      })),
    invites,
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
  /** Lobby rows, newest first. The caller adds the filters. */
  const lobbyQuery = () =>
    db
      .selectFrom("games")
      .innerJoin("users", "users.id", "games.owner_id")
      .selectAll("games")
      .select("users.name as owner_name");

  async function lobbyList(
    filter: (query: ReturnType<typeof lobbyQuery>) => ReturnType<typeof lobbyQuery>,
  ): Promise<LobbyGame[]> {
    const games = await filter(lobbyQuery())
      // `id` breaks a tie of equal times, so the order never changes between two reads.
      .orderBy("games.created_at", "desc")
      .orderBy("games.id", "desc")
      .execute();
    if (games.length === 0) return [];
    const seats = await db
      .selectFrom("seats")
      .selectAll()
      .where(
        "game_id",
        "in",
        games.map((game) => game.id),
      )
      .execute();
    return games.map((game) =>
      toLobbyGame(
        game,
        seats.filter((seat) => seat.game_id === game.id),
      ),
    );
  }

  /** The pending invites of one user, newest first. */
  const invitesOf = async (userId: string): Promise<Invite[]> => {
    const rows = await db
      .selectFrom("invites")
      .innerJoin("games", "games.id", "invites.game_id")
      .innerJoin("users as host", "host.id", "invites.invited_by_user_id")
      .select([
        "invites.id",
        "invites.game_id",
        "invites.state",
        "invites.created_at",
        "games.name as game_name",
        "host.name as host_name",
      ])
      .where("invites.invited_user_id", "=", userId)
      .where("invites.state", "=", "pending")
      .orderBy("invites.created_at", "desc")
      .orderBy("invites.id", "desc")
      .execute();
    return rows.map((row) => ({
      id: row.id,
      gameId: row.game_id,
      gameName: row.game_name,
      hostName: row.host_name,
      state: row.state,
      createdAt: row.created_at,
    }));
  };

  /** Tells each user the full list of their pending invites, after a commit. */
  const announceInvites = async (userIds: string[]) => {
    for (const userId of new Set(userIds)) {
      let invites: Invite[];
      try {
        invites = await invitesOf(userId);
      } catch (error) {
        // The change is committed. A failed read must not turn it into an error response.
        console.error("Invite list read failed", error);
        continue;
      }
      emit({ type: "invites.updated", userId, invites });
    }
  };

  /** The pending invites of a game, oldest first, with the display name of the invited user. */
  const loadInvites = async (exec: Kysely<Database>, gameId: string): Promise<RoomInvite[]> => {
    const rows = await exec
      .selectFrom("invites")
      .innerJoin("users", "users.id", "invites.invited_user_id")
      .select(["invites.id", "invites.invited_user_id", "invites.state", "users.name"])
      .where("invites.game_id", "=", gameId)
      .where("invites.state", "=", "pending")
      .orderBy("invites.created_at", "asc")
      .orderBy("invites.id", "asc")
      .execute();
    return rows.map((row) => ({
      id: row.id,
      userId: row.invited_user_id,
      name: row.name,
      state: row.state,
    }));
  };

  /** Adds the user seat for `user`, with the checks of a join. */
  const joinSeat = async (
    trx: Trx,
    game: GameRow,
    seats: SeatRow[],
    user: User,
  ): Promise<string[]> => {
    requireWaiting(game);
    if (seats.some((seat) => seat.kind === "user" && seat.user_id === user.id)) {
      throw new RoomError("already_joined", "You are already in this game");
    }
    requireRoom(seats, nameKey(user.name));
    await insertSeat(trx, game.id, seats, {
      name: user.name,
      kind: "user",
      userId: user.id,
      controllerId: user.id,
    });
    // A user who joins, by the link or by an invite, no longer waits for an answer.
    const accepted = await trx
      .updateTable("invites")
      .set({ state: "accepted", updated_at: now().toISOString() })
      .where("game_id", "=", game.id)
      .where("invited_user_id", "=", user.id)
      .where("state", "=", "pending")
      .executeTakeFirst();
    return accepted.numUpdatedRows > 0n ? [user.id] : [];
  };

  /** The users with a pending invite to the game. */
  const pendingInvitees = async (trx: Trx, gameId: string) =>
    (
      await trx
        .selectFrom("invites")
        .select("invited_user_id")
        .where("game_id", "=", gameId)
        .where("state", "=", "pending")
        .execute()
    ).map((row) => row.invited_user_id);

  /** The invite as its invitee sees it. Another user, or an unknown id, gets `not_found`. */
  const findInvite = async (exec: Kysely<Database>, inviteId: string, userId: string) => {
    const invite = await exec
      .selectFrom("invites")
      .selectAll()
      .where("id", "=", inviteId)
      .where("invited_user_id", "=", userId)
      .executeTakeFirst();
    if (!invite) throw new RoomError("not_found", "Invite not found");
    return invite;
  };

  async function changeRoom(
    gameId: string,
    // The ids that `change` returns are the users whose invites it changed. They are announced
    // after the commit.
    change: (trx: Trx, game: GameRow, seats: SeatRow[]) => Promise<string[] | void>,
  ): Promise<Game> {
    const { game, lobby, invitees } = await withConflictRetry(() =>
      db.transaction().execute(async (trx) => {
        const row = await loadGame(trx, gameId);
        const invitees = (await change(trx, row, await loadSeats(trx, gameId))) ?? [];
        const seats = await loadSeats(trx, gameId);
        const owner = await trx
          .selectFrom("users")
          .select("name")
          .where("id", "=", row.owner_id)
          .executeTakeFirstOrThrow();
        return {
          game: toApiGame(row, seats, await loadInvites(trx, gameId)),
          lobby: toLobbyGame({ ...row, owner_name: owner.name }, seats),
          invitees,
        };
      }),
    );
    emit({ type: "room.updated", game, lobby });
    await announceInvites(invitees);
    return game;
  }

  return {
    async create(user, name) {
      const { game, seats } = await db.transaction().execute(async (trx) => {
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
        return { game, seats: await loadSeats(trx, game.id) };
      });
      emit({ type: "room.created", lobby: toLobbyGame({ ...game, owner_name: user.name }, seats) });
      return toApiGame(game, seats);
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
      return toApiGame(game, seats, await loadInvites(db, gameId));
    },

    listOpen: () =>
      lobbyList((q) => q.where("games.status", "=", "waiting").limit(OPEN_GAMES_LIMIT)),

    listMine: (user) =>
      lobbyList((q) =>
        q
          .where("games.status", "in", ["waiting", "active", "saved"])
          .where(
            "games.id",
            "in",
            db.selectFrom("seats").select("game_id").where("controller_user_id", "=", user.id),
          ),
      ),

    join: (gameId, user) =>
      changeRoom(gameId, (trx, game, seats) => joinSeat(trx, game, seats, user)),

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

    changeToken: (gameId, user, seatId, token) =>
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
        if (seats.some((s) => s.id !== seat.id && s.token === token)) {
          throw new RoomError("token_taken", "Another seat has this token");
        }
        // The unique `(game_id, token)` index is the last guard against a race.
        await trx.updateTable("seats").set({ token }).where("id", "=", seat.id).execute();
      }),

    async removePlayer(gameId, host, userId) {
      const game = await changeRoom(gameId, async (trx, game, seats) => {
        if (game.owner_id !== host.id) {
          throw new RoomError("not_game_owner", "Only the owner can remove a player");
        }
        requireWaiting(game);
        if (userId === host.id) {
          throw new RoomError("cannot_remove_self", "The owner cannot remove their own seat");
        }
        const theirs = seats.filter((seat) => seat.controller_user_id === userId);
        if (theirs.length === 0) throw new RoomError("not_found", "This user has no seat");
        await removeSeats(
          trx,
          seats,
          theirs.map((seat) => seat.id),
        );
      });
      emit({ type: "room.removed", gameId, userId });
      return game;
    },

    async cancel(gameId, user) {
      const invitees = await db.transaction().execute(async (trx) => {
        const game = await loadGame(trx, gameId);
        if (game.owner_id !== user.id) {
          throw new RoomError("not_game_owner", "Only the owner can cancel the game");
        }
        requireWaiting(game);
        // Read before the delete: the cascade removes the invites with the game.
        const invitees = await pendingInvitees(trx, gameId);
        // Seats and invites go by cascade. The status guard keeps out a start that races us.
        const deleted = await trx
          .deleteFrom("games")
          .where("id", "=", gameId)
          .where("status", "=", "waiting")
          .executeTakeFirst();
        if (deleted.numDeletedRows === 0n) {
          throw new RoomError("game_not_waiting", "The game has started");
        }
        return invitees;
      });
      emit({ type: "room.cancelled", gameId });
      await announceInvites(invitees);
    },

    invite: (gameId, user, name) =>
      changeRoom(gameId, async (trx, game, seats) => {
        if (game.owner_id !== user.id) {
          throw new RoomError("not_game_owner", "Only the owner can invite");
        }
        requireWaiting(game);
        const target = await trx
          .selectFrom("users")
          .select("id")
          .where("name_key", "=", nameKey(name))
          .executeTakeFirst();
        if (!target) throw new RoomError("user_not_found", "No user has this name");
        if (target.id === user.id) {
          throw new RoomError("cannot_invite_self", "You cannot invite yourself");
        }
        if (seats.some((seat) => seat.kind === "user" && seat.user_id === target.id)) {
          throw new RoomError("already_joined", "This user is already in the game");
        }
        const existing = await trx
          .selectFrom("invites")
          .select(["id", "state"])
          .where("game_id", "=", gameId)
          .where("invited_user_id", "=", target.id)
          .executeTakeFirst();
        const time = now().toISOString();
        if (!existing) {
          await trx
            .insertInto("invites")
            .values({
              id: randomUUID(),
              game_id: gameId,
              invited_user_id: target.id,
              invited_by_user_id: user.id,
              state: "pending",
              created_at: time,
              updated_at: time,
            })
            .execute();
        } else if (existing.state === "pending") {
          throw new RoomError("already_invited", "This user is already invited");
        } else {
          // One row for each invited user: a new invite sets a declined or expired one back to
          // `pending`. `created_at` moves too, so the inbox shows the time of the new invite.
          await trx
            .updateTable("invites")
            .set({
              state: "pending",
              invited_by_user_id: user.id,
              created_at: time,
              updated_at: time,
            })
            .where("id", "=", existing.id)
            .execute();
        }
        return [target.id];
      }),

    listInvites: (user) => invitesOf(user.id),

    async acceptInvite(inviteId, user) {
      const { game_id: gameId } = await findInvite(db, inviteId, user.id);
      return changeRoom(gameId, async (trx, game, seats) => {
        const invite = await findInvite(trx, inviteId, user.id);
        // Start expires the invites, so an expired one means a game that has started.
        requireWaiting(game);
        if (invite.state !== "pending") throw new RoomError("not_found", "Invite not found");
        // A normal join, with the same errors. It also sets the invite to `accepted`.
        return joinSeat(trx, game, seats, user);
      });
    },

    async declineInvite(inviteId, user) {
      const { game_id: gameId } = await findInvite(db, inviteId, user.id);
      await changeRoom(gameId, async (trx, game) => {
        const invite = await findInvite(trx, inviteId, user.id);
        requireWaiting(game);
        if (invite.state !== "pending") throw new RoomError("not_found", "Invite not found");
        await trx
          .updateTable("invites")
          .set({ state: "declined", updated_at: now().toISOString() })
          .where("id", "=", inviteId)
          .execute();
        return [user.id];
      });
    },

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
          // Start ends the invites: they do not hold a seat, and the game is closed to joins.
          const invitees = await pendingInvitees(trx, gameId);
          await trx
            .updateTable("invites")
            .set({ state: "expired", updated_at: now().toISOString() })
            .where("game_id", "=", gameId)
            .where("state", "=", "pending")
            .execute();
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
            invitees,
            game: toApiGame({ ...game, status: "active", version: state.version }, seats),
          };
        }),
      );
      loader?.put(gameId, result.state);
      const redacted = redactState(result.state);
      emit({ type: "started", game: result.game, state: redacted });
      await announceInvites(result.invitees);
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
