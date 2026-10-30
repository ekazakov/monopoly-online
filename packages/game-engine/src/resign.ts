import type { ActionOf } from "./actions.ts";
import { declareBankruptcy } from "./bankruptcy.ts";
import { bankruptToBank } from "./debt.ts";
import { fail } from "./state.ts";
import type { GameEvent, GameState, Result } from "./state.ts";
import { advanceTurn } from "./turnflow.ts";

/**
 * A player gives up, on or off turn, but not while an auction runs. An open trade is cancelled,
 * because the bank may now auction deeds and the trade must not wait across that. Resigning is a bankruptcy: to the players the player owes debts to, or
 * else to the bank. On the player's own turn the turn moves on.
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
  if (toPlayers.length === 0) return { ok: true, state: bankruptToBank(next, id, events), events };

  const eliminated = declareBankruptcy(next, id, toPlayers, events);
  const onTurn = next.turn.currentPlayerId === id;
  return { ok: true, state: onTurn ? advanceTurn(eliminated, events) : eliminated, events };
}
