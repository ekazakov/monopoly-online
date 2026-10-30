import type { ActionOf } from "./actions.ts";
import { getPlayer } from "./helpers.ts";
import { leaveJailAndMove } from "./jail.ts";
import { transfer } from "./liquidation.ts";
import { fail } from "./state.ts";
import type { DebtThen, GameEvent, GameState, Result } from "./state.ts";
import { finishRoll } from "./turnflow.ts";

/** Continue the turn that a debt interrupted. */
export function continueAfterDebt(state: GameState, then: DebtThen, events: GameEvent[]): Result {
  switch (then) {
    case "finish_roll":
      return { ok: true, state: finishRoll(state, events), events };
    case "due_at_turn_start": {
      const player = getPlayer(state, state.turn.currentPlayerId);
      const phase = player.inJail ? "awaiting_jail_choice" : "awaiting_roll";
      return { ok: true, state: { ...state, turn: { ...state.turn, phase } }, events };
    }
    case "leave_jail_and_move": {
      const landed = leaveJailAndMove(state, events);
      return landed.ok ? { ok: true, state: landed.state, events } : landed;
    }
  }
}

/** Pay the oldest debt. When the last debt is paid, the interrupted turn continues. */
export function handlePayDebt(state: GameState, action: ActionOf<"PayDebt">): Result {
  const debt = state.debts.find((d) => d.debtorId === action.playerId);
  if (!debt) return fail("no_debt", "The player has no debt");
  if (getPlayer(state, action.playerId).cash < debt.amount) {
    return fail("insufficient_funds", "Raise cash first: sell buildings or mortgage a property");
  }

  const events: GameEvent[] = [
    { type: "DebtPaid", debtorId: debt.debtorId, creditor: debt.creditor, amount: debt.amount },
  ];
  const paid = transfer(state, debt.debtorId, [debt]);
  const next: GameState = { ...paid, debts: state.debts.filter((d) => d !== debt) };
  if (next.debts.some((d) => d.debtorId === action.playerId)) {
    return { ok: true, state: next, events };
  }
  return continueAfterDebt(next, debt.then, events);
}
