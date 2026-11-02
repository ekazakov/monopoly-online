import type { StreamMessage } from "@monopoly/shared";
import type { CommittedAction } from "../game/service.ts";
import type { RoomEvent } from "../rooms/service.ts";
import type { Bus } from "./bus.ts";

/** What the bus carries and the stream sends: a typed message of the shared envelope. */
export type StreamEnvelope = StreamMessage;

export const TOPIC_PREFIX = "game:";

export const gameTopic = (gameId: string): `game:${string}` => `${TOPIC_PREFIX}${gameId}`;

export const gameIdOf = (topic: string): string => topic.slice(TOPIC_PREFIX.length);

/**
 * The SSE `id` of a message: the engine version, set only on a `snapshot` of a started game and
 * on `game.actions`. `room.updated` and the `snapshot` of a waiting game (`state` is null) have
 * no id, so the browser keeps the last one it saw.
 */
export function sseEventId(message: StreamEnvelope): string | undefined {
  if (message.type === "game.actions") return String(message.version);
  if (message.type === "snapshot" && message.payload.state !== null) {
    return String(message.version);
  }
  return undefined;
}

/** The two callbacks that turn committed changes into bus messages. */
export function createPublishers(bus: Bus<StreamEnvelope>) {
  return {
    onCommitted({ gameId, events, state, version }: CommittedAction) {
      bus.publish(gameTopic(gameId), {
        topic: gameTopic(gameId),
        type: "game.actions",
        version,
        payload: { events, state },
      });
    },
    onRoomEvent(event: RoomEvent) {
      const topic = gameTopic(event.game.id);
      if (event.type === "room.updated") {
        bus.publish(topic, {
          topic,
          type: "room.updated",
          version: event.game.version,
          payload: { game: event.game },
        });
      } else {
        bus.publish(topic, {
          topic,
          type: "snapshot",
          version: event.state.version,
          payload: { game: event.game, state: event.state },
        });
      }
    },
  };
}
