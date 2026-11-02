import { z } from "zod";

/** Squares on the board. The drift test keeps it equal to the engine `BOARD_SIZE`. */
export const BOARD_SIZE = 40;

/** Engine player id. In the API it is the seat id. */
export const playerIdSchema = z.string().min(1);
export const squareSchema = z
  .number()
  .int()
  .min(0)
  .max(BOARD_SIZE - 1);
export const moneySchema = z.number().int().nonnegative();

export const phaseSchema = z.enum([
  "awaiting_roll",
  "awaiting_buy_decision",
  "awaiting_jail_choice",
  "awaiting_end_turn",
  "awaiting_debt",
  "awaiting_bid",
  "awaiting_trade_response",
  "game_over",
]);

export const deckNameSchema = z.enum(["chance", "chest"]);

export const diceSchema = z.tuple([z.number().int().min(1).max(6), z.number().int().min(1).max(6)]);

export const playerSchema = z.strictObject({
  id: playerIdSchema,
  name: z.string(),
  cash: moneySchema,
  position: squareSchema,
  inJail: z.boolean(),
  jailTurns: z.number().int().nonnegative(),
  heldJailCards: z.array(deckNameSchema),
  active: z.boolean(),
});

export const ownershipSchema = z.strictObject({
  ownerId: playerIdSchema,
  /** 0 to 4 houses, or 5 for a hotel. */
  houses: z.number().int().min(0).max(5),
  mortgaged: z.boolean(),
});

export const debtCreditorSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("bank") }),
  z.strictObject({ type: z.literal("player"), id: playerIdSchema }),
]);

export const debtReasonSchema = z.enum(["tax", "rent", "card", "fine"]);

export const debtSchema = z.strictObject({
  debtorId: playerIdSchema,
  creditor: debtCreditorSchema,
  amount: moneySchema,
  reason: debtReasonSchema,
  then: z.enum(["finish_roll", "due_at_turn_start", "leave_jail_and_move"]),
});

export const auctionSchema = z.strictObject({
  square: squareSchema,
  bidderOrder: z.array(playerIdSchema),
  passed: z.array(playerIdSchema),
  highBid: moneySchema,
  highBidderId: playerIdSchema.nullable(),
  actorId: playerIdSchema,
  then: z.enum(["finish_roll", "next_in_queue", "resume"]),
  queue: z.array(squareSchema),
  returnPhase: phaseSchema,
});

/** What one side of a trade hands over. */
export const tradeOfferSchema = z.strictObject({
  cash: moneySchema,
  squares: z.array(squareSchema),
  jailCards: z.array(deckNameSchema),
});

export const tradeSchema = z.strictObject({
  fromId: playerIdSchema,
  toId: playerIdSchema,
  give: tradeOfferSchema,
  get: tradeOfferSchema,
  returnPhase: phaseSchema,
});

export const turnSchema = z.strictObject({
  currentPlayerId: playerIdSchema,
  phase: phaseSchema,
  doubles: z.number().int().nonnegative(),
  dice: diceSchema.nullable(),
});

/** The engine `GameState` without `rng` and `decks`, which stay on the server. */
export const redactedGameStateSchema = z.strictObject({
  version: z.number().int().nonnegative(),
  players: z.array(playerSchema),
  /** Square index (as a string) to its deed. Missing means unowned. */
  ownership: z.record(z.string(), ownershipSchema),
  turn: turnSchema,
  debts: z.array(debtSchema),
  auction: auctionSchema.nullable(),
  trade: tradeSchema.nullable(),
});

export type Phase = z.infer<typeof phaseSchema>;
export type DeckName = z.infer<typeof deckNameSchema>;
export type TradeOffer = z.infer<typeof tradeOfferSchema>;
export type RedactedGameState = z.infer<typeof redactedGameStateSchema>;
