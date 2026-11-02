import { z } from "zod";
import { idSchema } from "./common.ts";
import { gameEventSchema } from "./events.ts";
import { gameSchema } from "./games.ts";
import { redactedGameStateSchema } from "./state.ts";

export const MAX_STREAM_TOPICS = 5;

export const streamMessageTypes = ["snapshot", "room.updated", "game.actions"] as const;

/** `game:<uuid>` */
export const streamTopicSchema = z.templateLiteral(["game:", idSchema]);

/** Query of `GET /api/stream`: a comma list of topics. */
export const streamQuerySchema = z.strictObject({ topics: z.string().min(1) });

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

/** One message per accepted action. */
export const gameActionsMessageSchema = message(
  "game.actions",
  z.strictObject({ events: z.array(gameEventSchema), state: redactedGameStateSchema }),
);

export const streamMessageSchema = z.discriminatedUnion("type", [
  snapshotMessageSchema,
  roomUpdatedMessageSchema,
  gameActionsMessageSchema,
]);

export type StreamMessage = z.infer<typeof streamMessageSchema>;
export type StreamMessageType = StreamMessage["type"];
