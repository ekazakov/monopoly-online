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
   * user is `online` while at least one stream is open, so two tabs need two closes.
   */
  connect(gameId: string, userId: string): () => void;
  /**
   * Start to watch a controller who may have no stream: at API start (`reconnecting`, with a new
   * grace timer) and at restore (`away` at once). Does nothing for a user with an open stream.
   */
  track(gameId: string, userId: string, initial: "reconnecting" | "away"): void;
  /** The status of one user, or undefined while the tracker does not know them. */
  status(gameId: string, userId: string): PresenceStatus | undefined;
  /** The status of every known user of a game, keyed by user id. */
  statuses(gameId: string): Record<string, PresenceStatus>;
  /** Listen to the changes, as `onChange` does. Returns the function that stops listening. */
  subscribe(listener: (change: PresenceChange) => void): () => void;
  /** Drop a game and its timers: it left `active`. */
  forget(gameId: string): void;
  /** Drop every game and timer. For shutdown and tests. */
  close(): void;
}

interface Entry {
  streams: number;
  status: PresenceStatus;
  timer: unknown;
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
  const games = new Map<string, Map<string, Entry>>();
  const listeners = new Set<(change: PresenceChange) => void>();

  function entryOf(gameId: string, userId: string): Entry | undefined {
    return games.get(gameId)?.get(userId);
  }

  function ensure(gameId: string, userId: string): Entry {
    let users = games.get(gameId);
    if (!users) {
      users = new Map();
      games.set(gameId, users);
    }
    let entry = users.get(userId);
    if (!entry) {
      entry = { streams: 0, status: "away", timer: null };
      users.set(userId, entry);
    }
    return entry;
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
      // A stream may have opened, or the game may be gone, since the timer started.
      if (entry.streams > 0 || entryOf(gameId, userId) !== entry) return;
      setStatus(gameId, userId, entry, "away");
    }, graceMs);
  }

  function forget(gameId: string) {
    for (const entry of games.get(gameId)?.values() ?? []) stopTimer(entry);
    games.delete(gameId);
  }

  return {
    connect(gameId, userId) {
      const entry = ensure(gameId, userId);
      entry.streams += 1;
      stopTimer(entry);
      // A new entry starts as `away` in `ensure`, so the first stream always reports a change.
      setStatus(gameId, userId, entry, "online");
      let open = true;
      return () => {
        if (!open) return;
        open = false;
        // The game may have been forgotten while the stream was open.
        if (entryOf(gameId, userId) !== entry) return;
        entry.streams -= 1;
        if (entry.streams > 0) return;
        setStatus(gameId, userId, entry, "reconnecting");
        startGrace(gameId, userId, entry);
      };
    },

    track(gameId, userId, initial) {
      const entry = ensure(gameId, userId);
      if (entry.streams > 0) return;
      if (initial === "away") {
        stopTimer(entry);
        setStatus(gameId, userId, entry, "away");
        return;
      }
      setStatus(gameId, userId, entry, "reconnecting");
      startGrace(gameId, userId, entry);
    },

    status: (gameId, userId) => entryOf(gameId, userId)?.status,

    statuses(gameId) {
      const result: Record<string, PresenceStatus> = {};
      for (const [userId, entry] of games.get(gameId) ?? []) result[userId] = entry.status;
      return result;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    forget,

    close() {
      for (const gameId of [...games.keys()]) forget(gameId);
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
