import type { ActionOf } from "./actions.ts";
import { isProperty, SQUARES } from "./board.ts";
import { declareBankruptcy } from "./bankruptcy.ts";
import type { Obligation } from "./bankruptcy.ts";
import { finishRoll, getPlayer, updatePlayer } from "./helpers.ts";
import { fail } from "./state.ts";
import type {
  Debt,
  DebtCreditor,
  DebtReason,
  DebtThen,
  Failure,
  GameEvent,
  GameState,
  Result,
} from "./state.ts";

export interface Charge {
  readonly creditor: DebtCreditor;
  readonly amount: number;
  readonly reason: DebtReason;
}

/** `settled` is true when the money was paid at once. Otherwise the debts are recorded. */
export type OweResult =
  | { readonly ok: true; readonly state: GameState; readonly settled: boolean }
  | Failure;

/**
 * Cash plus everything the player can turn into cash: the mortgage value of every
 * unmortgaged property, and half the build price of every house and hotel.
 */
export function liquidationValue(state: GameState, playerId: string): number {
  let total = getPlayer(state, playerId).cash;
  for (const [square, entry] of Object.entries(state.ownership)) {
    const info = SQUARES[Number(square)];
    if (entry.ownerId !== playerId || !info || !isProperty(info)) continue;
    if (!entry.mortgaged) total += info.mortgage;
    if (info.kind === "street") total += (entry.houses * info.buildPrice) / 2;
  }
  return total;
}

export const outstanding = (state: GameState, playerId: string) =>
  state.debts.filter((d) => d.debtorId === playerId).reduce((sum, d) => sum + d.amount, 0);

/** Take the money from the debtor and give it to the player creditors. */
function transfer(state: GameState, debtorId: string, charges: readonly Charge[]): GameState {
  let next = state;
  for (const { creditor, amount } of charges) {
    next = updatePlayer(next, debtorId, { cash: getPlayer(next, debtorId).cash - amount });
    if (creditor.type === "player") {
      const to = getPlayer(next, creditor.id);
      next = updatePlayer(next, creditor.id, { cash: to.cash + amount });
    }
  }
  return next;
}

/**
 * The debtor owes these charges. If cash covers them, they are paid at once. Otherwise, if the
 * liquidation value covers all outstanding debts, the charges become debts and the turn waits
 * in `awaiting_debt`. If even the liquidation value is too low, the action is rejected.
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
  if (liquidationValue(state, debtorId) < outstanding(state, debtorId) + total) {
    const obligations: Obligation[] = [
      ...state.debts.filter((d) => d.debtorId === debtorId),
      ...charges,
    ];
    if (obligations.some((o) => o.creditor.type === "bank")) {
      // TODO(bankruptcy to the bank): task 20.
      return fail("insufficient_funds", `The player cannot pay $${total}`);
    }
    // The debtor's turn (if it is their turn) has moved on, so the caller stops here.
    return {
      ok: true,
      state: declareBankruptcy(state, debtorId, obligations, events),
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
  return {
    ok: true,
    state: {
      ...state,
      debts: [...state.debts, ...debts],
      turn: { ...state.turn, phase: "awaiting_debt" },
    },
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
  return { ok: true, state: finishRoll(next, events), events };
}
