import type { ActionOf } from "./actions.ts";
import { startAuction } from "./auction.ts";
import { declareBankruptcy, declareBankruptcyToBank } from "./bankruptcy.ts";
import { bankruptToBank } from "./debt.ts";
import { continueAfterDebt } from "./paydebt.ts";
import { fail } from "./state.ts";
import type { GameEvent, GameState, Result } from "./state.ts";
import { advanceTurn } from "./turnflow.ts";

/**
 * A player gives up, on or off turn, but not while an auction runs. An open trade is cancelled,
 * because the bank may now auction deeds and the trade must not wait across that. Resigning is a
 * bankruptcy: to the players the player owes debts to, or else to the bank. On the player's own
 * turn the turn moves on. Off turn, the turn continues, after the bank auctions.
 */
export function handleResign(state: GameState, action: ActionOf<"Resign">): Result {
  if (state.auction) return fail("auction_running", "Wait for the auction to end");
  const id = action.playerId;
  const events: GameEvent[] = [{ type: "PlayerResigned", playerId: id }];

  let next = state;
  const trade = state.trade;
  if (trade) {
    events.push({ type: "TradeCancelled", fromId: trade.fromId, toId: trade.toId });
    next = { ...next, trade: null, turn: { ...next.turn, phase: trade.returnPhase } };
  }

  const toPlayers = next.debts.filter((d) => d.debtorId === id && d.creditor.type === "player");
  if (next.turn.currentPlayerId === id) {
    const after =
      toPlayers.length > 0
        ? advanceTurn(declareBankruptcy(next, id, toPlayers, events), events)
        : bankruptToBank(next, id, events);
    return { ok: true, state: after, events };
  }

  if (toPlayers.length > 0) {
    return continueIfFreed(next, declareBankruptcy(next, id, toPlayers, events), events);
  }
  const { state: eliminated, queue } = declareBankruptcyToBank(next, id, events);
  const freed = continueIfFreed(next, eliminated, events);
  const [first, ...rest] = queue;
  const left = eliminated.players.filter((p) => p.active).length;
  if (!freed.ok || first === undefined || left < 2) return freed;
  return { ok: true, state: startAuction(freed.state, first, "resume", events, rest), events };
}

/**
 * Debts owed to the resigned player are cancelled (Q17). If that clears every debt of the player
 * on turn, their turn goes on as if they had paid.
 */
function continueIfFreed(before: GameState, after: GameState, events: GameEvent[]): Result {
  const debtorId = after.turn.currentPlayerId;
  const last = before.debts.filter((d) => d.debtorId === debtorId).at(-1);
  if (
    after.turn.phase !== "awaiting_debt" ||
    !last ||
    after.debts.some((d) => d.debtorId === debtorId)
  ) {
    return { ok: true, state: after, events };
  }
  return continueAfterDebt(after, last.then, events);
}
