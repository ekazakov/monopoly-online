import type { Phase } from "./state.ts";

export type Action =
  | { type: "RollDice"; playerId: string }
  | { type: "BuyProperty"; playerId: string }
  | { type: "DeclineProperty"; playerId: string }
  | { type: "PayJailFine"; playerId: string }
  | { type: "UseJailCard"; playerId: string }
  | { type: "EndTurn"; playerId: string };

export type ActionType = Action["type"];

/** Phases in which each action is allowed. In Jail, the player may also roll for doubles. */
export const ALLOWED_PHASES: Readonly<Record<ActionType, readonly Phase[]>> = {
  RollDice: ["awaiting_roll", "awaiting_jail_choice"],
  BuyProperty: ["awaiting_buy_decision"],
  DeclineProperty: ["awaiting_buy_decision"],
  PayJailFine: ["awaiting_jail_choice"],
  UseJailCard: ["awaiting_jail_choice"],
  EndTurn: ["awaiting_end_turn"],
};
