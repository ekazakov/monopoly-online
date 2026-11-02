import { z } from "zod";
import { actionInputSchema } from "./actions.ts";
import { idSchema, timestampSchema } from "./common.ts";
import { gameEventSchema } from "./events.ts";
import { displayNameSchema } from "./session.ts";
import { redactedGameStateSchema } from "./state.ts";

/** Seats in a game. The drift test keeps it equal to the engine `MAX_PLAYERS`. */
export const MAX_SEATS = 6;
/** Largest version gap an SSE reconnect replays from `game_events`. Larger gaps get a snapshot. */
export const RESUME_MAX_GAP = 100;

export const gameNameSchema = z.string().trim().min(1).max(60);
export const seatNameSchema = displayNameSchema;

export const seatSchema = z.strictObject({
  id: idSchema,
  order: z.number().int().nonnegative(),
  name: seatNameSchema,
  kind: z.enum(["user", "hotseat"]),
  /** Null for a hot-seat seat. */
  userId: idSchema.nullable(),
  controllerUserId: idSchema,
});

export const gameStatusSchema = z.enum(["waiting", "active", "saved", "finished"]);

/** The room: seats and status, without the play state. */
export const gameSchema = z.strictObject({
  id: idSchema,
  name: gameNameSchema,
  status: gameStatusSchema,
  ownerId: idSchema,
  /** The engine version: 0 while `waiting`. Room changes do not change it. */
  version: z.number().int().nonnegative(),
  createdAt: timestampSchema,
  seats: z.array(seatSchema).max(MAX_SEATS),
});

export const createGameSchema = z.strictObject({ name: gameNameSchema });
export const createSeatSchema = z.strictObject({ name: seatNameSchema });

export const gameParamsSchema = z.strictObject({ id: idSchema });
export const seatParamsSchema = z.strictObject({ id: idSchema, seatId: idSchema });

export const gameResponseSchema = z.strictObject({ game: gameSchema });
export const startGameResponseSchema = z.strictObject({
  game: gameSchema,
  state: redactedGameStateSchema,
});

export const actionRequestSchema = z.strictObject({
  seatId: idSchema,
  action: actionInputSchema,
  expectedVersion: z.number().int().nonnegative(),
  clientActionId: idSchema,
});

/**
 * A repeat of the same `clientActionId` returns the stored `version` and `events` with the
 * current `state`, so `state.version` can be greater than `version`.
 */
export const actionResponseSchema = z.strictObject({
  version: z.number().int().nonnegative(),
  events: z.array(gameEventSchema),
  state: redactedGameStateSchema,
});

export const gameStateResponseSchema = z.strictObject({
  version: z.number().int().nonnegative(),
  state: redactedGameStateSchema,
});

export type CreateGameInput = z.infer<typeof createGameSchema>;
export type CreateSeatInput = z.infer<typeof createSeatSchema>;
export type Seat = z.infer<typeof seatSchema>;
export type GameStatus = z.infer<typeof gameStatusSchema>;
export type Game = z.infer<typeof gameSchema>;
export type ActionRequest = z.infer<typeof actionRequestSchema>;
export type ActionResponse = z.infer<typeof actionResponseSchema>;
