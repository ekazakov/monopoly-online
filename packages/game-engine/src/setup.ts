import { rollDice } from "./rng.ts";
import { fail } from "./state.ts";
import type { GameEvent, GameState, Result } from "./state.ts";

/**
 * One player rolls for turn order. When all contenders have rolled, the highest total
 * plays first. Tied players re-roll among themselves. Seat order does not change.
 */
export function rollForOrder(state: GameState, playerId: string): Result {
  const setup = state.setup;
  if (state.turn.phase !== "setup_roll" || !setup) {
    return fail("wrong_phase", "Turn order is already decided");
  }
  if (!state.players.some((p) => p.id === playerId)) {
    return fail("unknown_player", `Unknown player: ${playerId}`);
  }
  if (!setup.contenders.includes(playerId)) {
    return fail("not_a_contender", "This player does not roll in this round");
  }
  if (playerId in setup.rolls) {
    return fail("already_rolled", "This player already rolled in this round");
  }

  const roll = rollDice(state.rng);
  const total = roll.value[0] + roll.value[1];
  const rolls = { ...setup.rolls, [playerId]: total };
  const events: GameEvent[] = [{ type: "DiceRolled", playerId, dice: roll.value }];
  const base = { ...state, version: state.version + 1, rng: roll.rng };

  if (Object.keys(rolls).length < setup.contenders.length) {
    return { ok: true, state: { ...base, setup: { ...setup, rolls } }, events };
  }

  const best = Math.max(...Object.values(rolls));
  const leaders = setup.contenders.filter((id) => rolls[id] === best);
  const first = leaders[0];
  if (leaders.length > 1 || first === undefined) {
    events.push({ type: "OrderTied", playerIds: leaders });
    return {
      ok: true,
      state: { ...base, setup: { contenders: leaders, rolls: {} } },
      events,
    };
  }

  events.push({ type: "TurnOrderDecided", firstPlayerId: first });
  return {
    ok: true,
    state: {
      ...base,
      setup: null,
      turn: { currentPlayerId: first, phase: "awaiting_roll", doubles: 0, dice: null },
    },
    events,
  };
}
