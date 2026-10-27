import type { ActionOf } from "./actions.ts";
import { BOARD_SIZE } from "./board.ts";
import { advanceTurn, getPlayer, movePlayer, sendToJail } from "./helpers.ts";
import { resolveLanding } from "./landing.ts";
import { rollDice } from "./rng.ts";
import { fail } from "./state.ts";
import type { GameEvent, GameState, Result } from "./state.ts";

const MAX_DOUBLES = 3;

export function handleRollDice(state: GameState, action: ActionOf<"RollDice">): Result {
  const player = getPlayer(state, action.playerId);
  // TODO(jail): rolling for doubles in Jail is built in task 9.
  if (player.inJail) return fail("not_implemented", "Rolling in Jail is not built yet");

  const roll = rollDice(state.rng);
  const [first, second] = roll.value;
  const isDouble = first === second;
  const doubles = isDouble ? state.turn.doubles + 1 : 0;
  const events: GameEvent[] = [{ type: "DiceRolled", playerId: player.id, dice: roll.value }];
  let next: GameState = {
    ...state,
    rng: roll.rng,
    turn: { ...state.turn, dice: roll.value, doubles },
  };

  if (doubles === MAX_DOUBLES) {
    next = sendToJail(next, player.id, events);
    return { ok: true, state: advanceTurn(next, events), events };
  }

  const total = first + second;
  const to = (player.position + total) % BOARD_SIZE;
  next = movePlayer(next, player.id, to, events, player.position + total >= BOARD_SIZE);

  const landed = resolveLanding(next, events);
  if (!landed.ok) return landed;
  return { ok: true, state: landed.state, events };
}

export function handleEndTurn(state: GameState): Result {
  const events: GameEvent[] = [];
  return { ok: true, state: advanceTurn(state, events), events };
}
