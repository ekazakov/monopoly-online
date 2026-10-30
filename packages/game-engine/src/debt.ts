import { startAuction } from "./auction.ts";
import { declareBankruptcy, declareBankruptcyToBank } from "./bankruptcy.ts";
import type { Obligation } from "./bankruptcy.ts";
import { getPlayer } from "./helpers.ts";
import { liquidationValue, outstanding, transfer } from "./liquidation.ts";
import type { Charge } from "./liquidation.ts";
import type { Debt, DebtThen, Failure, GameEvent, GameState } from "./state.ts";
import { advanceTurn } from "./turnflow.ts";

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
 * even the liquidation value is too low, the debtor is bankrupt. A debt to the bank wins over
 * debts to players.
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
    return {
      ok: true,
      state: declareInsolvent(state, debtorId, obligations, events),
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

/**
 * The debtor cannot raise enough cash for these obligations. A debt to the bank wins over debts
 * to players. On the debtor's own turn the turn moves on (or the deeds are auctioned first).
 * Off turn, the turn does not move.
 */
export function declareInsolvent(
  state: GameState,
  debtorId: string,
  obligations: readonly Obligation[],
  events: GameEvent[],
): GameState {
  if (obligations.some((o) => o.creditor.type === "bank")) {
    return bankruptToBank(state, debtorId, events);
  }
  const eliminated = declareBankruptcy(state, debtorId, obligations, events);
  return state.turn.currentPlayerId === debtorId ? advanceTurn(eliminated, events) : eliminated;
}

/**
 * The debtor goes bankrupt to the bank. The bank then sells the deeds at auction, one at a time,
 * unless fewer than two players are left. On the debtor's own turn the turn then moves on. Off
 * turn (a player who resigns), the turn continues where it was.
 */
export function bankruptToBank(state: GameState, debtorId: string, events: GameEvent[]): GameState {
  const onTurn = state.turn.currentPlayerId === debtorId;
  const { state: eliminated, queue } = declareBankruptcyToBank(state, debtorId, events);
  const [first, ...rest] = queue;
  const left = eliminated.players.filter((p) => p.active).length;
  if (first === undefined || left < 2) {
    return onTurn ? advanceTurn(eliminated, events) : eliminated;
  }
  return startAuction(eliminated, first, onTurn ? "next_in_queue" : "resume", events, rest);
}
