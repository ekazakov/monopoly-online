import { LOBBY_TOPIC } from "@monopoly/shared";
import type {
  Game,
  LobbyGame,
  PresenceStatus,
  RedactedGameState,
  StreamMessage,
} from "@monopoly/shared";
import type { CommittedAction } from "../game/service.ts";
import type { RoomEvent } from "../rooms/service.ts";
import type { Bus } from "./bus.ts";

/** What the bus carries and the stream sends: a typed message of the shared envelope. */
export type StreamEnvelope = StreamMessage;

export const TOPIC_PREFIX = "game:";

export const gameTopic = (gameId: string): `game:${string}` => `${TOPIC_PREFIX}${gameId}`;

export const gameIdOf = (topic: string): string => topic.slice(TOPIC_PREFIX.length);

const USER_PREFIX = "user:";

export const lobbyTopic = LOBBY_TOPIC;

export const userTopic = (userId: string): `user:${string}` => `${USER_PREFIX}${userId}`;

export const userIdOf = (topic: string): string => topic.slice(USER_PREFIX.length);

export type TopicKind = "game" | "lobby" | "user";

/** The kind of a topic that passed `parseStreamTopics`. */
export function topicKind(topic: string): TopicKind {
  if (topic === LOBBY_TOPIC) return "lobby";
  return topic.startsWith(USER_PREFIX) ? "user" : "game";
}

/** The presence of every seat of a game. Version 0 and no SSE id: the next one replaces it. */
export const presenceMessage = (
  gameId: string,
  seats: Record<string, PresenceStatus>,
): StreamEnvelope => ({
  topic: gameTopic(gameId),
  type: "presence.updated",
  version: 0,
  payload: { seats },
});

/** The messages of the `lobby` topic. */
type LobbyMessage = Extract<
  StreamEnvelope,
  { type: "lobby.snapshot" | "lobby.updated" | "lobby.removed" }
>;

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
  const publishLobby = (message: LobbyMessage) => bus.publish(lobbyTopic, message);
  const lobbyUpdated = (game: LobbyGame): LobbyMessage => ({
    topic: lobbyTopic,
    type: "lobby.updated",
    version: 0,
    payload: { game },
  });
  const lobbyRemoved = (gameId: string): LobbyMessage => ({
    topic: lobbyTopic,
    type: "lobby.removed",
    version: 0,
    payload: { gameId },
  });

  return {
    onCommitted({ gameId, events, state, version }: CommittedAction) {
      bus.publish(gameTopic(gameId), {
        topic: gameTopic(gameId),
        type: "game.actions",
        version,
        payload: { events, state },
      });
    },
    /** A presence change: every device of the game gets the full seat map. */
    onPresence(gameId: string, seats: Record<string, PresenceStatus>) {
      bus.publish(gameTopic(gameId), presenceMessage(gameId, seats));
    },
    /** A claim: only the room of the game hears of it. */
    onRoomUpdated(game: Game) {
      const topic = gameTopic(game.id);
      bus.publish(topic, {
        topic,
        type: "room.updated",
        version: game.version,
        payload: { game },
      });
    },
    /** Finish, Save and Restore: every device of the game gets the new game and state. */
    onSnapshot({ game, state }: { game: Game; state: RedactedGameState }) {
      const topic = gameTopic(game.id);
      bus.publish(topic, {
        topic,
        type: "snapshot",
        version: state.version,
        payload: { game, state },
      });
    },
    onRoomEvent(event: RoomEvent) {
      switch (event.type) {
        case "room.created":
          publishLobby(lobbyUpdated(event.lobby));
          return;
        case "room.updated": {
          const topic = gameTopic(event.game.id);
          bus.publish(topic, {
            topic,
            type: "room.updated",
            version: event.game.version,
            payload: { game: event.game },
          });
          publishLobby(lobbyUpdated(event.lobby));
          return;
        }
        case "started": {
          const topic = gameTopic(event.game.id);
          bus.publish(topic, {
            topic,
            type: "snapshot",
            version: event.state.version,
            payload: { game: event.game, state: event.state },
          });
          // A started game is no longer open.
          publishLobby(lobbyRemoved(event.game.id));
          return;
        }
        case "room.cancelled": {
          // Version 0 and no SSE id: the topic is gone, so the client drops it.
          const topic = gameTopic(event.gameId);
          bus.publish(topic, {
            topic,
            type: "room.cancelled",
            version: 0,
            payload: { gameId: event.gameId },
          });
          publishLobby(lobbyRemoved(event.gameId));
          return;
        }
        case "invites.updated": {
          const topic = userTopic(event.userId);
          bus.publish(topic, {
            topic,
            type: "invites.updated",
            version: 0,
            payload: { invites: event.invites },
          });
          return;
        }
      }
    },
  };
}
