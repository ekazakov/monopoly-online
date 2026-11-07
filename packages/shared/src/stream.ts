import { z } from "zod";
import { idSchema } from "./common.ts";
import { gameEventSchema } from "./events.ts";
import { gameSchema, inviteSchema, lobbyGameSchema } from "./games.ts";
import { redactedGameStateSchema } from "./state.ts";

export const MAX_STREAM_TOPICS = 5;

export const streamMessageTypes = [
  "snapshot",
  "room.updated",
  "room.cancelled",
  "game.actions",
  "lobby.snapshot",
  "lobby.updated",
  "lobby.removed",
  "invites.updated",
  "presence.updated",
] as const;

/** `game:<uuid>`: one room. Its messages carry the engine version. */
export const gameTopicSchema = z.templateLiteral(["game:", idSchema]);
/** `user:<uuid>`: the private messages of one user. Only that user can open it. */
export const userTopicSchema = z.templateLiteral(["user:", idSchema]);
/** `lobby`: the open games. Any signed-in user can open it. */
export const LOBBY_TOPIC = "lobby";

/** `game:<uuid>`, `lobby` or `user:<uuid>` */
export const streamTopicSchema = z.union([
  gameTopicSchema,
  z.literal(LOBBY_TOPIC),
  userTopicSchema,
]);

/** A closed EventSource needs a new instance, so its cursor can be supplied in the query. */
export const streamQuerySchema = z.strictObject({
  topics: z.string().min(1),
  lastEventId: z
    .string()
    .regex(/^\d{1,15}$/)
    .optional(),
});

/** Split the `topics` query value. Null when it is empty, too long or has a bad topic. */
export function parseStreamTopics(raw: string): string[] | null {
  const topics = raw.split(",");
  if (topics.length > MAX_STREAM_TOPICS) return null;
  const parsed = z.array(streamTopicSchema).min(1).safeParse(topics);
  return parsed.success ? parsed.data : null;
}

/** The envelope of any message, with an untyped payload. */
export const streamEnvelopeSchema = z.strictObject({
  topic: streamTopicSchema,
  type: z.enum(streamMessageTypes),
  version: z.number().int().nonnegative(),
  payload: z.unknown(),
});

const message = <T extends (typeof streamMessageTypes)[number], P extends z.ZodType>(
  type: T,
  payload: P,
) =>
  z.strictObject({
    topic: streamTopicSchema,
    type: z.literal(type),
    version: z.number().int().nonnegative(),
    payload,
  });

/** Sent on connect, at start (version 0) and on a resume that cannot replay. */
export const snapshotMessageSchema = message(
  "snapshot",
  z.strictObject({ game: gameSchema, state: redactedGameStateSchema.nullable() }),
);

/** Join, leave, seat add or remove. */
export const roomUpdatedMessageSchema = message(
  "room.updated",
  z.strictObject({ game: gameSchema }),
);

/** The host deleted the game. The client drops the topic. No SSE id. */
export const roomCancelledMessageSchema = message(
  "room.cancelled",
  z.strictObject({ gameId: idSchema }),
);

/** One message per accepted action. */
export const gameActionsMessageSchema = message(
  "game.actions",
  z.strictObject({ events: z.array(gameEventSchema), state: redactedGameStateSchema }),
);

/** The full list of open games. Sent on each connect to `lobby`. Version 0, no SSE id. */
export const lobbySnapshotMessageSchema = message(
  "lobby.snapshot",
  z.strictObject({ games: z.array(lobbyGameSchema) }),
);

/** A game was created or changed: join, leave, seat or token change, invite accepted. */
export const lobbyUpdatedMessageSchema = message(
  "lobby.updated",
  z.strictObject({ game: lobbyGameSchema }),
);

/** A game left the open list: start or cancel. */
export const lobbyRemovedMessageSchema = message(
  "lobby.removed",
  z.strictObject({ gameId: idSchema }),
);

/** The full list of the pending invites of the user. Sent on connect and on each change. */
export const invitesUpdatedMessageSchema = message(
  "invites.updated",
  z.strictObject({ invites: z.array(inviteSchema) }),
);

/** `online`: the controller has a game stream open. `reconnecting`: no stream, inside the grace time. `away`: the grace time ended. */
export const presenceStatusSchema = z.enum(["online", "reconnecting", "away"]);

/**
 * The presence of every seat of a game, keyed by seat id. Sent on each change and on each connect
 * to `game:<id>`, also when a resume has nothing to send. Version 0, no SSE id.
 */
export const presenceUpdatedMessageSchema = message(
  "presence.updated",
  z.strictObject({ seats: z.record(idSchema, presenceStatusSchema) }),
);

export const streamMessageSchema = z.discriminatedUnion("type", [
  snapshotMessageSchema,
  roomUpdatedMessageSchema,
  roomCancelledMessageSchema,
  gameActionsMessageSchema,
  lobbySnapshotMessageSchema,
  lobbyUpdatedMessageSchema,
  lobbyRemovedMessageSchema,
  invitesUpdatedMessageSchema,
  presenceUpdatedMessageSchema,
]);

export type PresenceStatus = z.infer<typeof presenceStatusSchema>;
export type StreamMessage = z.infer<typeof streamMessageSchema>;
export type StreamMessageType = StreamMessage["type"];
