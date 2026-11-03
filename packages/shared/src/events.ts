import { z } from "zod";
import {
  debtCreditorSchema,
  debugChangeSchema,
  debtReasonSchema,
  deckNameSchema,
  diceSchema,
  moneySchema,
  playerIdSchema,
  squareSchema,
  tradeOfferSchema,
} from "./state.ts";

const housesSchema = z.number().int().min(0).max(5);

/** Every engine `GameEvent`. The drift test checks that the list is complete. */
export const gameEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("DiceRolled"), playerId: playerIdSchema, dice: diceSchema }),
  z.strictObject({
    type: z.literal("PlayerMoved"),
    playerId: playerIdSchema,
    from: squareSchema,
    to: squareSchema,
  }),
  z.strictObject({ type: z.literal("PassedGo"), playerId: playerIdSchema, amount: moneySchema }),
  z.strictObject({
    type: z.literal("PropertyBought"),
    playerId: playerIdSchema,
    square: squareSchema,
    price: moneySchema,
  }),
  z.strictObject({
    type: z.literal("RentPaid"),
    payerId: playerIdSchema,
    ownerId: playerIdSchema,
    square: squareSchema,
    amount: moneySchema,
  }),
  z.strictObject({
    type: z.literal("TaxPaid"),
    playerId: playerIdSchema,
    square: squareSchema,
    amount: moneySchema,
  }),
  z.strictObject({
    type: z.literal("CardDrawn"),
    playerId: playerIdSchema,
    deck: deckNameSchema,
    cardIndex: z.number().int().nonnegative(),
  }),
  z.strictObject({
    type: z.literal("CashChanged"),
    playerId: playerIdSchema,
    amount: z.number().int(),
    reason: z.literal("card"),
  }),
  z.strictObject({
    type: z.literal("BuildingBuilt"),
    playerId: playerIdSchema,
    square: squareSchema,
    houses: housesSchema,
    cost: moneySchema,
  }),
  z.strictObject({
    type: z.literal("BuildingSold"),
    playerId: playerIdSchema,
    square: squareSchema,
    houses: housesSchema,
    refund: moneySchema,
  }),
  z.strictObject({
    type: z.literal("PropertyMortgaged"),
    playerId: playerIdSchema,
    square: squareSchema,
    amount: moneySchema,
  }),
  z.strictObject({
    type: z.literal("PropertyUnmortgaged"),
    playerId: playerIdSchema,
    square: squareSchema,
    cost: moneySchema,
  }),
  z.strictObject({
    type: z.literal("DebtIncurred"),
    debtorId: playerIdSchema,
    creditor: debtCreditorSchema,
    amount: moneySchema,
    reason: debtReasonSchema,
  }),
  z.strictObject({
    type: z.literal("DebtPaid"),
    debtorId: playerIdSchema,
    creditor: debtCreditorSchema,
    amount: moneySchema,
  }),
  z.strictObject({
    type: z.literal("BankruptcyDeclared"),
    playerId: playerIdSchema,
    creditorIds: z.array(playerIdSchema),
  }),
  z.strictObject({
    type: z.literal("AssetsTransferred"),
    fromId: playerIdSchema,
    /** The player who gets the assets, or null when they go to the bank. */
    toId: playerIdSchema.nullable(),
    squares: z.array(squareSchema),
    jailCards: z.array(deckNameSchema),
    cash: z.array(z.strictObject({ playerId: playerIdSchema, amount: moneySchema })),
  }),
  z.strictObject({ type: z.literal("PlayerResigned"), playerId: playerIdSchema }),
  z.strictObject({ type: z.literal("PlayerEliminated"), playerId: playerIdSchema }),
  z.strictObject({
    type: z.literal("AuctionStarted"),
    square: squareSchema,
    bidderIds: z.array(playerIdSchema),
  }),
  z.strictObject({ type: z.literal("BidPlaced"), playerId: playerIdSchema, amount: moneySchema }),
  z.strictObject({ type: z.literal("BidPassed"), playerId: playerIdSchema, auto: z.boolean() }),
  z.strictObject({
    type: z.literal("AuctionEnded"),
    square: squareSchema,
    winnerId: playerIdSchema.nullable(),
    price: moneySchema,
  }),
  z.strictObject({
    type: z.literal("TradeProposed"),
    fromId: playerIdSchema,
    toId: playerIdSchema,
    give: tradeOfferSchema,
    get: tradeOfferSchema,
  }),
  z.strictObject({
    type: z.literal("TradeAccepted"),
    fromId: playerIdSchema,
    toId: playerIdSchema,
  }),
  z.strictObject({
    type: z.literal("TradeRejected"),
    fromId: playerIdSchema,
    toId: playerIdSchema,
  }),
  z.strictObject({
    type: z.literal("TradeCancelled"),
    fromId: playerIdSchema,
    toId: playerIdSchema,
  }),
  z.strictObject({ type: z.literal("FinePaid"), playerId: playerIdSchema, amount: moneySchema }),
  z.strictObject({ type: z.literal("SentToJail"), playerId: playerIdSchema }),
  z.strictObject({ type: z.literal("LeftJail"), playerId: playerIdSchema }),
  z.strictObject({
    type: z.literal("TurnEnded"),
    playerId: playerIdSchema,
    nextPlayerId: playerIdSchema,
  }),
  z.strictObject({ type: z.literal("GameEnded"), winnerId: playerIdSchema }),
  z.strictObject({
    type: z.literal("StateEdited"),
    playerId: playerIdSchema,
    change: debugChangeSchema,
  }),
]);

export type GameEvent = z.infer<typeof gameEventSchema>;
export type GameEventType = GameEvent["type"];
