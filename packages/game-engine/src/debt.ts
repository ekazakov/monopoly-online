import type { ActionOf } from "./actions.ts";
import { declareBankruptcy } from "./bankruptcy.ts";
import type { Obligation } from "./bankruptcy.ts";
import { getPlayer } from "./helpers.ts";
import { liquidationValue, outstanding, transfer } from "./liquidation.ts";
import type { Charge } from "./liquidation.ts";
import { fail } from "./state.ts";
import type { Debt, DebtThen, Failure, GameEvent, GameState, Result } from "./state.ts";
import { advanceTurn, finishRoll } from "./turnflow.ts";

export { liquidationValue, outstanding } from "./liquidation.ts";
export type { Charge } from "./liquidation.ts";

/** `settled` is true when the money was paid at once. Otherwise the caller must stop. */
export type OweResult =
  | { readonly ok: true; readonly state: GameState; readonly settled: boolean }
  | Failure;

/**
 * The debtor owes these charges. If cash covers them, they are paid at once. Otherwise, if the
 * liquidation value covers all outstanding debts, the charges become debts. On the debtor's own
 * turn the turn waits in `awaiting_debt`. Off turn, the debts fall due when their turn starts. If
 * even the liquidation value is too low, the debtor is bankrupt (to players) or the action is
 * rejected (to the bank, until task 20).
 */
export function oweMany(
  state: GameState,
  debtorId: string,
  charges: readonly Charge[],
  events: GameEvent[],
  then: DebtThen,
): OweResult {
  const total = charges.reduce((sum, c) => sum + c.amount, 0);
  if (getPlayer(state, debtorId).cash >= total) {
    return { ok: true, state: transfer(state, debtorId, charges), settled: true };
  }
  const onTurn = state.turn.currentPlayerId === debtorId;
  if (liquidationValue(state, debtorId) < outstanding(state, debtorId) + total) {
    const obligations: Obligation[] = [
      ...state.debts.filter((d) => d.debtorId === debtorId),
      ...charges,
    ];
    if (obligations.some((o) => o.creditor.type === "bank")) {
      // TODO(bankruptcy to the bank): task 20.
      return fail("insufficient_funds", `The player cannot pay $${total}`);
    }
    const eliminated = declareBankruptcy(state, debtorId, obligations, events);
    // The debtor's turn is over. Off turn, the turn does not move.
    return {
      ok: true,
      state: onTurn ? advanceTurn(eliminated, events) : eliminated,
      settled: false,
    };
  }
  const debts: Debt[] = charges.map((c) => ({ debtorId, ...c, then }));
  for (const c of charges) {
    events.push({
      type: "DebtIncurred",
      debtorId,
      creditor: c.creditor,
      amount: c.amount,
      reason: c.reason,
    });
  }
  const recorded = { ...state, debts: [...state.debts, ...debts] };
  return {
    ok: true,
    state: onTurn ? { ...recorded, turn: { ...recorded.turn, phase: "awaiting_debt" } } : recorded,
    settled: false,
  };
}

export function owe(
  state: GameState,
  debtorId: string,
  charge: Charge,
  events: GameEvent[],
  then: DebtThen,
): OweResult {
  return oweMany(state, debtorId, [charge], events, then);
}

/** Continue the turn that a debt interrupted. */
function resume(state: GameState, then: DebtThen, events: GameEvent[]): GameState {
  switch (then) {
    case "finish_roll":
      return finishRoll(state, events);
    case "due_at_turn_start": {
      const player = getPlayer(state, state.turn.currentPlayerId);
      const phase = player.inJail ? "awaiting_jail_choice" : "awaiting_roll";
      return { ...state, turn: { ...state.turn, phase } };
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
  return { ok: true, state: resume(next, debt.then, events), events };
}
