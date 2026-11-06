import type { PresenceStatus } from "@monopoly/shared";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";

/** How long a controller without a game stream stays `reconnecting` before they are `away`. */
export const DEFAULT_GRACE_MS = 60_000;

export interface PresenceChange {
  gameId: string;
  userId: string;
  status: PresenceStatus;
}

export interface PresenceTimers {
  set(callback: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface PresenceTrackerOptions {
  /** Defaults to `DEFAULT_GRACE_MS`. */
  graceMs?: number;
  /** Defaults to the global timers. Tests inject their own, as `heartbeatMs` does for the stream. */
  timers?: PresenceTimers;
  /** Called after a user's status changed, never for a call that changes nothing. */
  onChange?: (change: PresenceChange) => void;
}

export interface PresenceTracker {
  /**
   * A game stream of `userId` opened on `game:<gameId>`. Returns the function that closes it. The
   * tracker counts every stream, whatever the status of the game, so that it knows who is there
   * when a game starts or is restored. A user is `online` in a watched game while at least one
   * stream is open, so two tabs need two closes.
   */
  connect(gameId: string, userId: string): () => void;
  /**
   * Start to watch the controllers of a game that is `active` now: at start, at restore and at API
   * start. A user with an open stream is `online`. The others get `initial`: `reconnecting` with a
   * new grace timer, or `away` at once (restore: gameplay 3.1).
   */
  watch(gameId: string, userIds: readonly string[], initial: "reconnecting" | "away"): void;
  /** The status of one user, or undefined while the game is not watched or the user unknown. */
  status(gameId: string, userId: string): PresenceStatus | undefined;
  /** The status of every known user of a watched game, keyed by user id. */
  statuses(gameId: string): Record<string, PresenceStatus>;
  /** Listen to the changes, as `onChange` does. Returns the function that stops listening. */
  subscribe(listener: (change: PresenceChange) => void): () => void;
  /** Stop to watch a game and clear its timers: it left `active`. Open streams stay counted. */
  forget(gameId: string): void;
  /** Drop every game and timer. For shutdown and tests. */
  close(): void;
}

interface Entry {
  streams: number;
  /** Null while the game is not watched. */
  status: PresenceStatus | null;
  timer: unknown;
}

interface GameEntry {
  watched: boolean;
  users: Map<string, Entry>;
}

/**
 * In-memory presence of the controllers of started games. A controller with an open game stream
 * is `online`. When the last stream closes they are `reconnecting`, and `graceMs` later `away`. It
 * knows users, not seats: a controller of several seats is one entry.
 */
export function createPresenceTracker(options: PresenceTrackerOptions = {}): PresenceTracker {
  const graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
  const timers: PresenceTimers = options.timers ?? {
    set: (callback, ms) => setTimeout(callback, ms),
    clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  const games = new Map<string, GameEntry>();
  const listeners = new Set<(change: PresenceChange) => void>();

  function entryOf(gameId: string, userId: string): Entry | undefined {
    return games.get(gameId)?.users.get(userId);
  }

  function ensureGame(gameId: string): GameEntry {
    let game = games.get(gameId);
    if (!game) {
      game = { watched: false, users: new Map() };
      games.set(gameId, game);
    }
    return game;
  }

  function ensure(gameId: string, userId: string): Entry {
    const game = ensureGame(gameId);
    let entry = game.users.get(userId);
    if (!entry) {
      entry = { streams: 0, status: null, timer: null };
      game.users.set(userId, entry);
    }
    return entry;
  }

  /** Drop an entry nobody needs: no stream, and the game is not watched. */
  function release(gameId: string, userId: string) {
    const game = games.get(gameId);
    if (!game) return;
    const entry = game.users.get(userId);
    if (entry && entry.streams === 0 && !game.watched) game.users.delete(userId);
    if (game.users.size === 0 && !game.watched) games.delete(gameId);
  }

  function stopTimer(entry: Entry) {
    if (entry.timer === null) return;
    timers.clear(entry.timer);
    entry.timer = null;
  }

  function setStatus(gameId: string, userId: string, entry: Entry, status: PresenceStatus) {
    if (entry.status === status) return;
    entry.status = status;
    const change = { gameId, userId, status };
    options.onChange?.(change);
    for (const listener of [...listeners]) listener(change);
  }

  function startGrace(gameId: string, userId: string, entry: Entry) {
    stopTimer(entry);
    entry.timer = timers.set(() => {
      entry.timer = null;
      // A stream may have opened, or the game may have left `active`, since the timer started.
      if (entry.streams > 0 || entryOf(gameId, userId) !== entry) return;
      if (!games.get(gameId)?.watched) return;
      setStatus(gameId, userId, entry, "away");
    }, graceMs);
  }

  function forget(gameId: string) {
    const game = games.get(gameId);
    if (!game) return;
    game.watched = false;
    for (const [userId, entry] of [...game.users]) {
      stopTimer(entry);
      entry.status = null;
      if (entry.streams === 0) game.users.delete(userId);
    }
    if (game.users.size === 0) games.delete(gameId);
  }

  return {
    connect(gameId, userId) {
      const entry = ensure(gameId, userId);
      entry.streams += 1;
      if (games.get(gameId)?.watched) {
        stopTimer(entry);
        setStatus(gameId, userId, entry, "online");
      }
      let open = true;
      return () => {
        if (!open) return;
        open = false;
        // `close` may have dropped the game while the stream was open.
        if (entryOf(gameId, userId) !== entry) return;
        entry.streams -= 1;
        if (entry.streams > 0) return;
        if (games.get(gameId)?.watched) {
          setStatus(gameId, userId, entry, "reconnecting");
          startGrace(gameId, userId, entry);
        } else {
          release(gameId, userId);
        }
      };
    },

    watch(gameId, userIds, initial) {
      const game = ensureGame(gameId);
      game.watched = true;
      for (const userId of userIds) {
        const entry = ensure(gameId, userId);
        if (entry.streams > 0) {
          stopTimer(entry);
          setStatus(gameId, userId, entry, "online");
        } else if (initial === "away") {
          stopTimer(entry);
          setStatus(gameId, userId, entry, "away");
        } else {
          setStatus(gameId, userId, entry, "reconnecting");
          startGrace(gameId, userId, entry);
        }
      }
    },

    status: (gameId, userId) => entryOf(gameId, userId)?.status ?? undefined,

    statuses(gameId) {
      const result: Record<string, PresenceStatus> = {};
      for (const [userId, entry] of games.get(gameId)?.users ?? []) {
        if (entry.status) result[userId] = entry.status;
      }
      return result;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    forget,

    close() {
      for (const game of games.values()) {
        for (const entry of game.users.values()) stopTimer(entry);
      }
      games.clear();
    },
  };
}

/**
 * The presence of every seat of a game, keyed by seat id. A seat has the status of its controller.
 * A seat whose controller the tracker does not know is left out.
 */
export async function readSeatPresence(
  db: Kysely<Database>,
  presence: PresenceTracker,
  gameId: string,
): Promise<Record<string, PresenceStatus>> {
  const seats = await db
    .selectFrom("seats")
    .select(["id", "controller_user_id"])
    .where("game_id", "=", gameId)
    .orderBy("seat_order")
    .execute();
  const result: Record<string, PresenceStatus> = {};
  for (const seat of seats) {
    const status = presence.status(gameId, seat.controller_user_id);
    if (status) result[seat.id] = status;
  }
  return result;
}

/**
 * At API start: every controller of an `active` game gets a new grace timer. A game that nobody
 * comes back to saves itself when the timers end. Nobody has a stream yet, so all are
 * `reconnecting`. Returns the number of games watched.
 */
export async function watchActiveGames(
  db: Kysely<Database>,
  presence: PresenceTracker,
): Promise<number> {
  const rows = await db
    .selectFrom("seats")
    .innerJoin("games", "games.id", "seats.game_id")
    .select(["seats.game_id", "seats.controller_user_id"])
    .where("games.status", "=", "active")
    .execute();
  const controllers = new Map<string, Set<string>>();
  for (const row of rows) {
    const users = controllers.get(row.game_id) ?? new Set<string>();
    users.add(row.controller_user_id);
    controllers.set(row.game_id, users);
  }
  for (const [gameId, users] of controllers) presence.watch(gameId, [...users], "reconnecting");
  return controllers.size;
}

/** The distinct controllers of the seats of a game. */
export const controllersOf = (seats: readonly { controllerUserId: string }[]): string[] => [
  ...new Set(seats.map((seat) => seat.controllerUserId)),
];
