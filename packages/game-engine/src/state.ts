import type { Dice, RngState } from "./rng.ts";

export const STARTING_CASH = 1500;
export const GO_SALARY = 200;
export const JAIL_FINE = 50;
/** Failed rolls for doubles before the fine is mandatory. */
export const MAX_JAIL_ATTEMPTS = 3;
/** Two to six players in a game, with any number on one device (decided, Q1). */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

export type DeckName = "chance" | "chest";

export type Phase =
  | "awaiting_roll"
  | "awaiting_buy_decision"
  | "awaiting_jail_choice"
  | "awaiting_end_turn"
  | "awaiting_debt"
  | "awaiting_bid"
  | "awaiting_trade_response"
  | "game_over";

export interface Player {
  readonly id: string;
  readonly name: string;
  readonly cash: number;
  readonly position: number;
  readonly inJail: boolean;
  /** Failed attempts to leave Jail. */
  readonly jailTurns: number;
  /** Get Out of Jail Free cards held, each with the deck it returns to. */
  readonly heldJailCards: readonly DeckName[];
  readonly active: boolean;
}

export interface Ownership {
  readonly ownerId: string;
  /** 0 to 4 houses, or 5 for a hotel. Only streets have buildings. */
  readonly houses: number;
  readonly mortgaged: boolean;
}

export type DebtCreditor =
  | { readonly type: "bank" }
  | { readonly type: "player"; readonly id: string };

export type DebtReason = "tax" | "rent" | "card" | "fine";

/** What continues after the last debt of a player is paid. */
export type DebtThen = "finish_roll" | "due_at_turn_start" | "leave_jail_and_move";

export interface Debt {
  readonly debtorId: string;
  readonly creditor: DebtCreditor;
  readonly amount: number;
  readonly reason: DebtReason;
  readonly then: DebtThen;
}

/**
 * What continues when an auction ends. `next_in_queue` sells the next deed of a player who went
 * bankrupt on their turn, then moves the turn on. `resume` does the same for a player who resigned
 * off turn, then returns to `returnPhase`.
 */
export type AuctionThen = "finish_roll" | "next_in_queue" | "resume";

export interface Auction {
  readonly square: number;
  /** Bidders in seat order, starting with the player who landed on the square. */
  readonly bidderOrder: readonly string[];
  /** Bidders who passed. A pass is final. */
  readonly passed: readonly string[];
  /** The best bid so far, or 0 when nobody has bid. */
  readonly highBid: number;
  readonly highBidderId: string | null;
  /** The bidder who must act now. */
  readonly actorId: string;
  readonly then: AuctionThen;
  /** Squares the bank still has to sell after this one (bankruptcy to the bank), in board order. */
  readonly queue: readonly number[];
  /** The phase of the player on turn when the auction started. */
  readonly returnPhase: Phase;
}

/** What one side of a trade hands over. */
export interface TradeOffer {
  readonly cash: number;
  readonly squares: readonly number[];
  readonly jailCards: readonly DeckName[];
}

export interface Trade {
  readonly fromId: string;
  readonly toId: string;
  /** What the proposer gives. */
  readonly give: TradeOffer;
  /** What the proposer receives. */
  readonly get: TradeOffer;
  /** The phase to return to when the trade is answered. */
  readonly returnPhase: Phase;
}

export interface TurnState {
  readonly currentPlayerId: string;
  readonly phase: Phase;
  /** Doubles rolled in a row this turn. */
  readonly doubles: number;
  readonly dice: Dice | null;
}

export interface GameState {
  /** Increases by one for each accepted action. */
  readonly version: number;
  /** Players in turn order. Play follows this order. */
  readonly players: readonly Player[];
  /** Square index (as a string) to its deed. Missing means unowned. */
  readonly ownership: Readonly<Record<string, Ownership>>;
  readonly turn: TurnState;
  /** Debts that wait for payment, oldest first. */
  readonly debts: readonly Debt[];
  /** The running auction, if any. */
  readonly auction: Auction | null;
  /** The open trade proposal, if any. */
  readonly trade: Trade | null;
  /** Card indexes into the static decks, top card first. Held jail cards are not in the list. */
  readonly decks: Readonly<Record<DeckName, readonly number[]>>;
  readonly rng: RngState;
}

export type GameEvent =
  | { type: "DiceRolled"; playerId: string; dice: Dice }
  | { type: "PlayerMoved"; playerId: string; from: number; to: number }
  | { type: "PassedGo"; playerId: string; amount: number }
  | { type: "PropertyBought"; playerId: string; square: number; price: number }
  | { type: "RentPaid"; payerId: string; ownerId: string; square: number; amount: number }
  | { type: "TaxPaid"; playerId: string; square: number; amount: number }
  | { type: "CardDrawn"; playerId: string; deck: DeckName; cardIndex: number }
  | { type: "CashChanged"; playerId: string; amount: number; reason: "card" }
  | { type: "BuildingBuilt"; playerId: string; square: number; houses: number; cost: number }
  | { type: "BuildingSold"; playerId: string; square: number; houses: number; refund: number }
  | { type: "PropertyMortgaged"; playerId: string; square: number; amount: number }
  | { type: "PropertyUnmortgaged"; playerId: string; square: number; cost: number }
  | {
      type: "DebtIncurred";
      debtorId: string;
      creditor: DebtCreditor;
      amount: number;
      reason: DebtReason;
    }
  | { type: "DebtPaid"; debtorId: string; creditor: DebtCreditor; amount: number }
  | { type: "BankruptcyDeclared"; playerId: string; creditorIds: readonly string[] }
  | {
      type: "AssetsTransferred";
      fromId: string;
      /** The player who gets the assets, or null when they go to the bank. */
      toId: string | null;
      squares: readonly number[];
      /** The jail cards the player held. They always return to their decks (Q14). */
      jailCards: readonly DeckName[];
      cash: readonly { playerId: string; amount: number }[];
    }
  | { type: "PlayerResigned"; playerId: string }
  | { type: "PlayerEliminated"; playerId: string }
  | { type: "AuctionStarted"; square: number; bidderIds: readonly string[] }
  | { type: "BidPlaced"; playerId: string; amount: number }
  | { type: "BidPassed"; playerId: string; auto: boolean }
  | { type: "AuctionEnded"; square: number; winnerId: string | null; price: number }
  | { type: "TradeProposed"; fromId: string; toId: string; give: TradeOffer; get: TradeOffer }
  | { type: "TradeAccepted"; fromId: string; toId: string }
  | { type: "TradeRejected"; fromId: string; toId: string }
  | { type: "TradeCancelled"; fromId: string; toId: string }
  | { type: "FinePaid"; playerId: string; amount: number }
  | { type: "SentToJail"; playerId: string }
  | { type: "LeftJail"; playerId: string }
  | { type: "TurnEnded"; playerId: string; nextPlayerId: string }
  | { type: "GameEnded"; winnerId: string };

export type GameErrorCode =
  | "invalid_players"
  | "unknown_player"
  | "player_inactive"
  | "not_your_turn"
  | "wrong_phase"
  /** A voluntary payment (buying, building, lifting a mortgage, paying early) the player cannot afford. */
  | "insufficient_funds"
  | "no_jail_card"
  | "not_owner"
  | "not_a_street"
  | "incomplete_group"
  | "group_mortgaged"
  | "uneven_build"
  | "max_buildings"
  | "no_buildings"
  | "not_a_property"
  | "already_mortgaged"
  | "not_mortgaged"
  | "has_buildings"
  | "no_debt"
  | "invalid_bid"
  | "invalid_trade"
  /** A player cannot resign while an auction runs. */
  | "auction_running";

export interface GameError {
  readonly code: GameErrorCode;
  readonly message: string;
}

export interface Success {
  readonly ok: true;
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

export interface Failure {
  readonly ok: false;
  readonly error: GameError;
}

export type Result = Success | Failure;

/** Build a rejected `Result`. */
export function fail(code: GameErrorCode, message: string): Failure {
  return { ok: false, error: { code, message } };
}
