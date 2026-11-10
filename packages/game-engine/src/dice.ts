import { rollDice } from "./rng.ts";
import type { Dice } from "./rng.ts";
import type { GameState } from "./state.ts";

/**
 * The dice of the next roll, and the state after it. A value that the debug panel set
 * (`nextDice`) is used once and cleared, and the random state does not advance. Otherwise the
 * seeded random state rolls.
 */
export function takeDice(state: GameState): { dice: Dice; state: GameState } {
  if (state.nextDice) return { dice: state.nextDice, state: { ...state, nextDice: null } };
  const roll = rollDice(state.rng);
  return { dice: roll.value, state: { ...state, rng: roll.rng } };
}
