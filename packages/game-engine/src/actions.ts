import type { GameState, Phase, TradeOffer } from "./state.ts";

export type Action =
  | { type: "RollDice"; playerId: string }
  | { type: "BuyProperty"; playerId: string }
  | { type: "DeclineProperty"; playerId: string }
  | { type: "PayJailFine"; playerId: string }
  | { type: "UseJailCard"; playerId: string }
  | { type: "Build"; playerId: string; square: number }
  | { type: "SellBuilding"; playerId: string; square: number }
  | { type: "Mortgage"; playerId: string; square: number }
  | { type: "Unmortgage"; playerId: string; square: number }
  | { type: "PayDebt"; playerId: string }
  | { type: "Bid"; playerId: string; amount: number }
  | { type: "PassBid"; playerId: string }
  | {
      type: "ProposeTrade";
      playerId: string;
      toPlayerId: string;
      give: TradeOffer;
      get: TradeOffer;
    }
  | { type: "AcceptTrade"; playerId: string }
  | { type: "RejectTrade"; playerId: string }
  | { type: "CancelTrade"; playerId: string }
  | { type: "EndTurn"; playerId: string };

export type ActionType = Action["type"];
export type ActionOf<T extends ActionType> = Extract<Action, { type: T }>;

/** Phases in which a player may manage property: before the roll and after the landing. */
const MANAGE_PHASES: readonly Phase[] = [
  "awaiting_roll",
  "awaiting_jail_choice",
  "awaiting_end_turn",
];

/** Raising cash for a debt: selling and mortgaging are allowed, building and lifting are not. */
const DEBT_PHASES: readonly Phase[] = [...MANAGE_PHASES, "awaiting_debt"];

/** Phases in which each action is allowed. In Jail, the player may also roll for doubles. */
export const ALLOWED_PHASES: Readonly<Record<ActionType, readonly Phase[]>> = {
  RollDice: ["awaiting_roll", "awaiting_jail_choice"],
  BuyProperty: ["awaiting_buy_decision"],
  DeclineProperty: ["awaiting_buy_decision"],
  PayJailFine: ["awaiting_jail_choice"],
  UseJailCard: ["awaiting_jail_choice"],
  EndTurn: ["awaiting_end_turn"],
  Build: MANAGE_PHASES,
  SellBuilding: DEBT_PHASES,
  Mortgage: DEBT_PHASES,
  Unmortgage: MANAGE_PHASES,
  PayDebt: ["awaiting_debt"],
  Bid: ["awaiting_bid"],
  PassBid: ["awaiting_bid"],
  ProposeTrade: DEBT_PHASES,
  AcceptTrade: ["awaiting_trade_response"],
  RejectTrade: ["awaiting_trade_response"],
  CancelTrade: ["awaiting_trade_response"],
};

/** The player who must act now: the bidder, the trade partner, or the player on turn. */
export function actorFor(state: GameState): string {
  if (state.turn.phase === "awaiting_bid" && state.auction) return state.auction.actorId;
  if (state.turn.phase === "awaiting_trade_response" && state.trade) return state.trade.toId;
  return state.turn.currentPlayerId;
}

/** Whether a player may do this action now. Only the proposer can cancel an open trade. */
export function mayAct(state: GameState, type: ActionType, playerId: string): boolean {
  if (type === "CancelTrade" && state.trade) return playerId === state.trade.fromId;
  return actorFor(state) === playerId;
}
