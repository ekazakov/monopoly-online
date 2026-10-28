import { isProperty, SQUARES } from "./board.ts";
import { getPlayer, updatePlayer } from "./helpers.ts";
import type { DebtCreditor, DebtReason, GameState } from "./state.ts";

export interface Charge {
  readonly creditor: DebtCreditor;
  readonly amount: number;
  readonly reason: DebtReason;
}

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
export function transfer(
  state: GameState,
  debtorId: string,
  charges: readonly { creditor: DebtCreditor; amount: number }[],
): GameState {
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
