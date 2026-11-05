import type { Bus } from "./bus.ts";
import type { StreamEnvelope } from "./messages.ts";
import type { TopicStart } from "./resume.ts";

/** Only a `snapshot` and `game.actions` carry the engine version of a game. */
const isVersioned = (message: StreamEnvelope) =>
  message.type === "snapshot" || message.type === "game.actions";

/**
 * A message that replaces or edits a whole view (`room.updated`, the lobby messages and
 * `invites.updated`). One that was published before the topic was read is older than what the
 * read returned. `room.cancelled` is never stale: it ends the topic.
 */
const isStateless = (message: StreamEnvelope) =>
  !isVersioned(message) && message.type !== "room.cancelled";

export interface StreamConnection {
  /** Messages to send first, in order. */
  initial: StreamEnvelope[];
  /** Start live delivery. Messages that arrived during the handshake and are still new go first. */
  start(send: (message: StreamEnvelope) => void): void;
  /** Unsubscribe from the bus. Safe to call more than once. */
  close(): void;
}

/**
 * Opens the bus subscriptions BEFORE the current state is read, so no change falls between the
 * read and the subscription. Bus messages that arrive during the handshake wait in `pending`.
 * Then `start` drops what the initial messages already cover:
 * - `snapshot` and `game.actions` with a version up to the covered version of the topic;
 * - `room.updated` that was published before the room was read (it carries the full room, so an
 *   older copy would undo the newer one).
 * Live messages go through the same version check, so a version is never sent twice.
 */
export async function openConnection(options: {
  bus: Bus<StreamEnvelope>;
  topics: string[];
  readTopic: (topic: string) => Promise<TopicStart>;
}): Promise<StreamConnection> {
  const { bus, topics, readTopic } = options;
  const covered = new Map<string, number>();
  const readAt = new Map<string, number>();
  const pending: StreamEnvelope[] = [];
  let send: ((message: StreamEnvelope) => void) | null = null;
  let closed = false;

  function deliver(message: StreamEnvelope) {
    if (isVersioned(message)) {
      if (message.version <= (covered.get(message.topic) ?? -1)) return;
      covered.set(message.topic, message.version);
    }
    send?.(message);
  }

  const unsubscribers = topics.map((topic) =>
    bus.subscribe(topic, (message) => {
      if (closed) return;
      if (send) deliver(message);
      else pending.push(message);
    }),
  );
  const close = () => {
    closed = true;
    send = null;
    for (const unsubscribe of unsubscribers) unsubscribe();
  };

  const initial: StreamEnvelope[] = [];
  try {
    for (const topic of topics) {
      readAt.set(topic, pending.length);
      const start = await readTopic(topic);
      covered.set(topic, start.covered);
      initial.push(...start.messages);
    }
  } catch (error) {
    close();
    throw error;
  }

  return {
    initial,
    start(sendMessage) {
      if (closed) return;
      send = sendMessage;
      const waiting = pending.splice(0);
      for (const [index, message] of waiting.entries()) {
        const stale = isStateless(message) && index < (readAt.get(message.topic) ?? 0);
        if (!stale) deliver(message);
      }
    },
    close,
  };
}
