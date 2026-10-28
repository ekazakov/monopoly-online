import { isProperty, SQUARES } from "./board.ts";
import { getPlayer, updatePlayer } from "./helpers.ts";
import { entryOf, ownedSquares, setEntry } from "./ownership.ts";
import type { DebtCreditor, GameEvent, GameState } from "./state.ts";

export interface Obligation {
  readonly creditor: DebtCreditor;
  readonly amount: number;
}

/** Active players after `playerId` in turn order, ending with the players before them. */
function turnOrderAfter(state: GameState, playerId: string): string[] {
  const index = state.players.findIndex((p) => p.id === playerId);
  const count = state.players.length;
  const ids: string[] = [];
  for (let step = 1; step < count; step++) {
    const other = state.players[(index + step) % count];
    if (other?.active) ids.push(other.id);
  }
  return ids;
}

/**
 * The debtor cannot pay what they owe to players. Their buildings are sold to the bank at half
 * price. Their cash is split among the creditors in proportion to the amounts owed (each share
 * rounded down, the remainder to the biggest creditor). The deeds, still mortgaged if they
 * were, and the jail cards go to the biggest creditor (a tie goes to whoever plays first after
 * the debtor). The debtor is eliminated. The caller moves the turn on if it was their turn.
 */
export function declareBankruptcy(
  state: GameState,
  debtorId: string,
  obligations: readonly Obligation[],
  events: GameEvent[],
): GameState {
  const owed = new Map<string, number>();
  for (const { creditor, amount } of obligations) {
    if (creditor.type === "player") owed.set(creditor.id, (owed.get(creditor.id) ?? 0) + amount);
  }
  const order = turnOrderAfter(state, debtorId);
  const creditors = [...owed.entries()]
    .map(([id, amount]) => ({ id, amount }))
    .sort((a, b) => b.amount - a.amount || order.indexOf(a.id) - order.indexOf(b.id));
  const biggest = creditors[0];
  if (!biggest) throw new Error("Bankruptcy to players needs a player creditor");
  events.push({
    type: "BankruptcyDeclared",
    playerId: debtorId,
    creditorIds: creditors.map((c) => c.id),
  });

  // Sell the buildings to the bank at half price.
  let next = state;
  let cash = getPlayer(state, debtorId).cash;
  for (const square of ownedSquares(state, debtorId)) {
    const info = SQUARES[square];
    const entry = entryOf(next, square);
    if (!entry || info?.kind !== "street") continue;
    cash += (entry.houses * info.buildPrice) / 2;
    next = setEntry(next, square, { ...entry, houses: 0 });
  }

  // Split the cash.
  const total = creditors.reduce((sum, c) => sum + c.amount, 0);
  const shares = creditors.map((c) => ({
    playerId: c.id,
    amount: Math.floor((cash * c.amount) / total),
  }));
  const remainder = cash - shares.reduce((sum, s) => sum + s.amount, 0);
  const first = shares.find((s) => s.playerId === biggest.id);
  if (first) first.amount += remainder;
  for (const { playerId, amount } of shares) {
    next = updatePlayer(next, playerId, { cash: getPlayer(next, playerId).cash + amount });
  }

  // Deeds and jail cards go to the biggest creditor.
  const squares = ownedSquares(next, debtorId).filter((sq) => {
    const info = SQUARES[sq];
    return info !== undefined && isProperty(info);
  });
  for (const square of squares) {
    const entry = entryOf(next, square);
    if (entry) next = setEntry(next, square, { ...entry, ownerId: biggest.id });
  }
  const jailCards = getPlayer(next, debtorId).heldJailCards;
  const heir = getPlayer(next, biggest.id);
  next = updatePlayer(next, biggest.id, { heldJailCards: [...heir.heldJailCards, ...jailCards] });
  events.push({
    type: "AssetsTransferred",
    fromId: debtorId,
    toId: biggest.id,
    squares,
    jailCards,
    cash: shares,
  });

  // Eliminate the debtor. Their debts end, and debts owed to them are cancelled.
  next = updatePlayer(next, debtorId, { cash: 0, heldJailCards: [], active: false });
  next = {
    ...next,
    debts: next.debts.filter(
      (d) =>
        d.debtorId !== debtorId && !(d.creditor.type === "player" && d.creditor.id === debtorId),
    ),
  };
  events.push({ type: "PlayerEliminated", playerId: debtorId });

  return next;
}
