import type { Dice, RngState } from "./rng.ts";

export const STARTING_CASH = 1500;
export const GO_SALARY = 200;
export const JAIL_FINE = 50;
/** Failed rolls for doubles before the fine is mandatory. */
export const MAX_JAIL_ATTEMPTS = 3;
/** Open question Q1: the real limit is not decided. The engine accepts the wide range. */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

export type DeckName = "chance" | "chest";

export type Phase =
  | "awaiting_roll"
  | "awaiting_buy_decision"
  | "awaiting_jail_choice"
  | "awaiting_end_turn"
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
  /** Square index (as a string) to owner. Missing means unowned. */
  readonly ownership: Readonly<Record<string, Ownership>>;
  readonly turn: TurnState;
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
  /** Temporary. Debt and bankruptcy are not built yet, so a payment the player cannot make is rejected. */
  | "insufficient_funds"
  | "no_jail_card";

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
