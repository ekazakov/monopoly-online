import type { GameState } from "@monopoly/game-engine";
import type { RedactedGameState } from "@monopoly/shared";

/**
 * The state a client may see: the engine state without `rng` and the deck order. Devices learn
 * about card draws only from events. Fields are listed one by one, so a field added to the engine
 * state stays on the server until it is added here and in `redactedGameStateSchema`.
 * The result is a deep copy: it shares nothing mutable with the input.
 */
export function redactState(state: GameState): RedactedGameState {
  return structuredClone({
    version: state.version,
    players: state.players,
    ownership: state.ownership,
    turn: state.turn,
    debts: state.debts,
    auction: state.auction,
    trade: state.trade,
  }) as RedactedGameState;
}
