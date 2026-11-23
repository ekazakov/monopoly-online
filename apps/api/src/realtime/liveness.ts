// Liveness of the game streams. A client that loses its network without a clean close keeps its
// TCP socket open for minutes, and a heartbeat write still succeeds, so the server cannot see the
// loss. The client pings its stream by id. A stream with no ping for `timeoutMs` is closed here,
// and the presence of its user then changes as for any other closed stream.

export interface LivenessRegistry {
  /**
   * Register an open stream of `userId` under `streamId`. `onSilent` closes the stream. A stream
   * that is already registered under the same id is closed first, as its client has retried.
   * Returns the function that unregisters the stream.
   */
  open(streamId: string, userId: string, onSilent: () => void): () => void;
  /** Mark the stream alive. False when no open stream of `userId` has this id. */
  ping(streamId: string, userId: string): boolean;
  /** Stop every check. Open streams are not closed here. */
  close(): void;
}

export interface LivenessOptions {
  /** A stream with no ping for this long is silent. */
  timeoutMs: number;
  /** How often the streams are checked. Defaults to a quarter of `timeoutMs`. */
  checkMs?: number;
  /** Clock in ms. Defaults to `Date.now`. */
  now?: () => number;
}

interface Entry {
  userId: string;
  lastSeen: number;
  onSilent: () => void;
  timer?: ReturnType<typeof setInterval>;
}

export function createLivenessRegistry(options: LivenessOptions): LivenessRegistry {
  const { timeoutMs } = options;
  const checkMs = options.checkMs ?? Math.max(1, Math.floor(timeoutMs / 4));
  const now = options.now ?? Date.now;
  const streams = new Map<string, Entry>();

  function stop(streamId: string, entry: Entry) {
    clearInterval(entry.timer);
    if (streams.get(streamId) === entry) streams.delete(streamId);
  }

  return {
    open(streamId, userId, onSilent) {
      const previous = streams.get(streamId);
      if (previous) {
        stop(streamId, previous);
        previous.onSilent();
      }
      const entry: Entry = { userId, lastSeen: now(), onSilent };
      entry.timer = setInterval(() => {
        if (now() - entry.lastSeen < timeoutMs) return;
        stop(streamId, entry);
        entry.onSilent();
      }, checkMs);
      streams.set(streamId, entry);
      return () => stop(streamId, entry);
    },

    ping(streamId, userId) {
      const entry = streams.get(streamId);
      if (!entry || entry.userId !== userId) return false;
      entry.lastSeen = now();
      return true;
    },

    close() {
      for (const [streamId, entry] of [...streams]) stop(streamId, entry);
    },
  };
}
