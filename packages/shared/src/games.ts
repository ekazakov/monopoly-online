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

/**
 * The game pieces, in the free-token order: create, join and add-seat give the first token that
 * no seat of the game has. There is one token for each seat, and each token has one fixed colour.
 */
export const TOKENS = ["dog", "cat", "penguin", "car", "horse", "duck"] as const;
export const tokenSchema = z.enum(TOKENS);

export const seatSchema = z.strictObject({
  id: idSchema,
  order: z.number().int().nonnegative(),
  name: seatNameSchema,
  kind: z.enum(["user", "hotseat"]),
  /** Null for a hot-seat seat. */
  userId: idSchema.nullable(),
  controllerUserId: idSchema,
  /** Unique in a game. The controller of the seat can change it while the game is `waiting`. */
  token: tokenSchema,
});

export const gameStatusSchema = z.enum(["waiting", "active", "saved", "finished"]);

export const inviteStateSchema = z.enum(["pending", "accepted", "declined", "expired"]);

/** An invite as the host sees it in the room: the invited user and the state. */
export const roomInviteSchema = z.strictObject({
  id: idSchema,
  userId: idSchema,
  /** The display name of the invited user. */
  name: seatNameSchema,
  state: inviteStateSchema,
});

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
  /** The pending invites only. They do not hold a seat. */
  invites: z.array(roomInviteSchema),
});

/** One row of the lobby lists (open games and My games). */
export const lobbyGameSchema = z.strictObject({
  id: idSchema,
  name: gameNameSchema,
  ownerName: displayNameSchema,
  status: gameStatusSchema,
  seatCount: z.number().int().min(0).max(MAX_SEATS),
  /** The tokens that the seats have. The lobby shows them as the avatars of the row. */
  tokens: z.array(tokenSchema).max(MAX_SEATS),
  createdAt: timestampSchema,
});

/** An invite as the invited user sees it in the lobby inbox. */
export const inviteSchema = z.strictObject({
  id: idSchema,
  gameId: idSchema,
  gameName: gameNameSchema,
  hostName: displayNameSchema,
  state: inviteStateSchema,
  createdAt: timestampSchema,
});

export const createGameSchema = z.strictObject({ name: gameNameSchema });
export const createSeatSchema = z.strictObject({ name: seatNameSchema });
export const changeTokenSchema = z.strictObject({ token: tokenSchema });

export const gameParamsSchema = z.strictObject({ id: idSchema });
export const seatParamsSchema = z.strictObject({ id: idSchema, seatId: idSchema });

export const gameResponseSchema = z.strictObject({ game: gameSchema });

/** `GET /api/games` lists open games only, so `waiting` is the one status it takes. */
export const openGamesQuerySchema = z.strictObject({ status: z.literal("waiting") });
export const lobbyGamesResponseSchema = z.strictObject({ games: z.array(lobbyGameSchema) });
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
export type ChangeTokenInput = z.infer<typeof changeTokenSchema>;
export type Token = z.infer<typeof tokenSchema>;
export type Seat = z.infer<typeof seatSchema>;
export type InviteState = z.infer<typeof inviteStateSchema>;
export type RoomInvite = z.infer<typeof roomInviteSchema>;
export type LobbyGame = z.infer<typeof lobbyGameSchema>;
export type Invite = z.infer<typeof inviteSchema>;
export type GameStatus = z.infer<typeof gameStatusSchema>;
export type Game = z.infer<typeof gameSchema>;
export type ActionRequest = z.infer<typeof actionRequestSchema>;
export type ActionResponse = z.infer<typeof actionResponseSchema>;
