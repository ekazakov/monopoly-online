import { z } from "zod";
import {
  debugChangeSchema,
  moneySchema,
  playerIdSchema,
  squareSchema,
  tradeOfferSchema,
} from "./state.ts";

/** The most changes in one `DebugEdit`: every deed on the board, plus cash and tokens. */
export const MAX_DEBUG_CHANGES = 100;

const bare = <T extends string>(type: T) => z.strictObject({ type: z.literal(type) });
const onSquare = <T extends string>(type: T) =>
  z.strictObject({ type: z.literal(type), square: squareSchema });

/** The engine actions without `playerId`: the server sets it from the seat. */
export const actionInputSchema = z.discriminatedUnion("type", [
  bare("RollDice"),
  bare("BuyProperty"),
  bare("DeclineProperty"),
  bare("PayJailFine"),
  bare("UseJailCard"),
  onSquare("Build"),
  onSquare("SellBuilding"),
  onSquare("Mortgage"),
  onSquare("Unmortgage"),
  bare("PayDebt"),
  z.strictObject({ type: z.literal("Bid"), amount: moneySchema }),
  bare("PassBid"),
  z.strictObject({
    type: z.literal("ProposeTrade"),
    toPlayerId: playerIdSchema,
    give: tradeOfferSchema,
    get: tradeOfferSchema,
  }),
  bare("AcceptTrade"),
  bare("RejectTrade"),
  bare("CancelTrade"),
  bare("EndTurn"),
  bare("Resign"),
  z.strictObject({
    type: z.literal("DebugEdit"),
    changes: z.array(debugChangeSchema).min(1).max(MAX_DEBUG_CHANGES),
  }),
]);

export type ActionInput = z.infer<typeof actionInputSchema>;
