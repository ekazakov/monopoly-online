import { z } from "zod";
import { idSchema } from "./common.ts";
import { MAX_SEATS, seatNameSchema } from "./games.ts";

export const standingStatusSchema = z.enum(["winner", "bankrupt", "resigned"]);

export const standingSchema = z.strictObject({
  /** 1 is the winner. The others rank by elimination order: the last one out is 2, the first one out is last. */
  rank: z.number().int().min(1).max(MAX_SEATS),
  /** Also the engine player id. */
  seatId: idSchema,
  name: seatNameSchema,
  controllerUserId: idSchema,
  status: standingStatusSchema,
  /** The round in which the player went out. Null for the winner. */
  outRound: z.number().int().min(1).nullable(),
  /** Final cash, properties owned and net worth. All 0 for a player who is out. */
  cash: z.number().int().nonnegative(),
  properties: z.number().int().nonnegative(),
  netWorth: z.number().int().nonnegative(),
});

/**
 * The result of a finished game. A round is `1 + floor(TurnEnded events so far / seats at game
 * start)`: the engine has no round counter. `rounds` is that number at the end of the game.
 * Net worth is cash, plus the price of every owned property (half when mortgaged), plus the
 * build cost of every house and hotel.
 */
export const gameResultSchema = z.strictObject({
  gameId: idSchema,
  rounds: z.number().int().min(1),
  winner: z.strictObject({ seatId: idSchema, name: seatNameSchema }),
  /** In rank order. */
  standings: z.array(standingSchema).min(2).max(MAX_SEATS),
});

export const gameResultResponseSchema = z.strictObject({ result: gameResultSchema });

export type StandingStatus = z.infer<typeof standingStatusSchema>;
export type Standing = z.infer<typeof standingSchema>;
export type GameResult = z.infer<typeof gameResultSchema>;
export type GameResultResponse = z.infer<typeof gameResultResponseSchema>;
