import { declareBankruptcy } from "./bankruptcy.ts";
import { getPlayer } from "./helpers.ts";
import { liquidationValue, outstanding, transfer } from "./liquidation.ts";
import type { GameEvent, GameState, Player } from "./state.ts";

const restPhase = (player: Player) => (player.inJail ? "awaiting_jail_choice" : "awaiting_roll");

/**
 * Give the turn to the next active player. A player in Jail starts in the jail phase. Debts
 * that fall due at the start of a turn are settled before anything else.
 */
export function advanceTurn(state: GameState, events: GameEvent[]): GameState {
  const currentId = state.turn.currentPlayerId;
  const count = state.players.length;
  const index = state.players.findIndex((p) => p.id === currentId);
  for (let step = 1; step <= count; step++) {
    const next = state.players[(index + step) % count];
    if (next?.active) {
      events.push({ type: "TurnEnded", playerId: currentId, nextPlayerId: next.id });
      const started: GameState = {
        ...state,
        turn: { currentPlayerId: next.id, phase: restPhase(next), doubles: 0, dice: null },
      };
      return settleDueDebts(started, events);
    }
  }
  throw new Error("No active player");
}

/**
 * Pending debts fall due when their debtor's turn starts. The bankruptcy test runs again. A
 * debtor whose cash covers them pays at once. Otherwise the debtor must raise the cash first.
 */
function settleDueDebts(state: GameState, events: GameEvent[]): GameState {
  const id = state.turn.currentPlayerId;
  const due = state.debts.filter((d) => d.debtorId === id && d.then === "due_at_turn_start");
  if (due.length === 0) return state;

  const owed = outstanding(state, id);
  if (liquidationValue(state, id) < owed) {
    const eliminated = declareBankruptcy(
      state,
      id,
      state.debts.filter((d) => d.debtorId === id),
      events,
    );
    return advanceTurn(eliminated, events);
  }
  if (getPlayer(state, id).cash < owed) {
    return { ...state, turn: { ...state.turn, phase: "awaiting_debt" } };
  }

  let next = state;
  for (const debt of due) {
    events.push({
      type: "DebtPaid",
      debtorId: id,
      creditor: debt.creditor,
      amount: debt.amount,
    });
    next = transfer(next, id, [debt]);
  }
  return { ...next, debts: next.debts.filter((d) => !due.includes(d)) };
}

/**
 * Call when a roll is fully resolved (the landing is done). A player sent to Jail loses
 * the turn at once. A double rolled in this turn gives another roll (leaving Jail by doubles
 * does not count). Otherwise the player may end the turn.
 */
export function finishRoll(state: GameState, events: GameEvent[]): GameState {
  const player = getPlayer(state, state.turn.currentPlayerId);
  if (player.inJail || !player.active) return advanceTurn(state, events);
  return {
    ...state,
    turn: {
      ...state.turn,
      phase: state.turn.doubles > 0 ? "awaiting_roll" : "awaiting_end_turn",
    },
  };
}
