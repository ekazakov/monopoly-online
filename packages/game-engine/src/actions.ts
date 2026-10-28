import type { Phase } from "./state.ts";

export type Action =
  | { type: "RollDice"; playerId: string }
  | { type: "BuyProperty"; playerId: string }
  | { type: "DeclineProperty"; playerId: string }
  | { type: "PayJailFine"; playerId: string }
  | { type: "UseJailCard"; playerId: string }
  | { type: "Build"; playerId: string; square: number }
  | { type: "SellBuilding"; playerId: string; square: number }
  | { type: "EndTurn"; playerId: string };

export type ActionType = Action["type"];
export type ActionOf<T extends ActionType> = Extract<Action, { type: T }>;

/** Phases in which a player may manage property: before the roll and after the landing. */
const MANAGE_PHASES: readonly Phase[] = [
  "awaiting_roll",
  "awaiting_jail_choice",
  "awaiting_end_turn",
];

/** Phases in which each action is allowed. In Jail, the player may also roll for doubles. */
export const ALLOWED_PHASES: Readonly<Record<ActionType, readonly Phase[]>> = {
  RollDice: ["awaiting_roll", "awaiting_jail_choice"],
  BuyProperty: ["awaiting_buy_decision"],
  DeclineProperty: ["awaiting_buy_decision"],
  PayJailFine: ["awaiting_jail_choice"],
  UseJailCard: ["awaiting_jail_choice"],
  EndTurn: ["awaiting_end_turn"],
  Build: MANAGE_PHASES,
  SellBuilding: MANAGE_PHASES,
};
