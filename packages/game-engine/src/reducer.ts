import { ALLOWED_PHASES } from "./actions.ts";
import type { Action, ActionOf, ActionType } from "./actions.ts";
import { handleBuild, handleSellBuilding } from "./buildings.ts";
import { handlePayDebt } from "./debt.ts";
import { handleMortgage, handleUnmortgage } from "./mortgage.ts";
import { handlePayJailFine, handleUseJailCard } from "./jail.ts";
import { handleBuyProperty, handleDeclineProperty } from "./landing.ts";
import { handleEndTurn, handleRollDice } from "./turn.ts";
import { checkGameEnd } from "./gameend.ts";
import { fail } from "./state.ts";
import type { GameState, Result } from "./state.ts";

/** A handler gets a validated action. It must not change `version`: the reducer does that. */
export type Handlers = {
  [T in ActionType]: (state: GameState, action: ActionOf<T>) => Result;
};

export const defaultHandlers: Handlers = {
  RollDice: handleRollDice,
  BuyProperty: handleBuyProperty,
  DeclineProperty: handleDeclineProperty,
  PayJailFine: handlePayJailFine,
  UseJailCard: handleUseJailCard,
  EndTurn: handleEndTurn,
  Build: handleBuild,
  SellBuilding: handleSellBuilding,
  Mortgage: handleMortgage,
  Unmortgage: handleUnmortgage,
  PayDebt: handlePayDebt,
};

/** Check who may act, and in which phase. Return an error `Result`, or null when valid. */
function validate(state: GameState, action: Action): Result | null {
  const player = state.players.find((p) => p.id === action.playerId);
  if (!player) return fail("unknown_player", `Unknown player: ${action.playerId}`);
  if (!player.active) return fail("player_inactive", "Eliminated players cannot act");
  if (state.turn.currentPlayerId !== action.playerId) {
    return fail("not_your_turn", "It is not this player's turn");
  }
  if (!ALLOWED_PHASES[action.type].includes(state.turn.phase)) {
    return fail("wrong_phase", `${action.type} is not allowed in phase ${state.turn.phase}`);
  }
  return null;
}

export function createReducer(handlers: Handlers) {
  return function applyAction(state: GameState, action: Action): Result {
    const invalid = validate(state, action);
    if (invalid) return invalid;

    const handle = handlers[action.type] as (s: GameState, a: Action) => Result;
    const result = handle(state, action);
    if (!result.ok) return result;
    const versioned = { ...result.state, version: state.version + 1 };
    return checkGameEnd(versioned, result.events);
  };
}

/** Apply one action. Pure: returns the new state and events, or an error. */
export const applyAction = createReducer(defaultHandlers);
