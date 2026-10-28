import type { ActionOf } from "./actions.ts";
import { groupSquares, isProperty, SQUARES } from "./board.ts";
import { declareInsolvent } from "./debt.ts";
import { getPlayer, updatePlayer } from "./helpers.ts";
import { liquidationValue, outstanding } from "./liquidation.ts";
import { entryOf, setEntry } from "./ownership.ts";
import { fail } from "./state.ts";
import type { DeckName, GameEvent, GameState, Player, Result, Trade, TradeOffer } from "./state.ts";

/** Check an offer. Returns a message when the trade is not allowed, otherwise null. */
function problem(state: GameState, trade: Omit<Trade, "returnPhase">): string | null {
  const { fromId, toId, give, get } = trade;
  const from = state.players.find((p) => p.id === fromId);
  const to = state.players.find((p) => p.id === toId);
  if (!from || !to || !from.active || !to.active) return "Both players must be in the game";
  if (fromId === toId) return "A player cannot trade with themselves";

  const empty = (o: TradeOffer) =>
    o.cash === 0 && o.squares.length === 0 && o.jailCards.length === 0;
  if (empty(give) && empty(get)) return "The trade is empty";

  for (const [owner, offer, side] of [
    [from, give, "The proposer"],
    [to, get, "The partner"],
  ] as const) {
    if (!Number.isInteger(offer.cash) || offer.cash < 0)
      return "Cash must be a whole number, 0 or more";
    if (owner.cash < offer.cash) return `${side} does not have $${offer.cash}`;
    if (new Set(offer.squares).size !== offer.squares.length) return "A square is listed twice";
    for (const square of offer.squares) {
      const info = SQUARES[square];
      if (!info || !isProperty(info)) return `Square ${square} is not a property`;
      if (entryOf(state, square)?.ownerId !== owner.id)
        return `${side} does not own square ${square}`;
      // A property cannot change hands while any street of its colour group has buildings.
      if (groupSquares(info.group).some((sq) => (entryOf(state, sq)?.houses ?? 0) > 0)) {
        return `Square ${square} is in a group with buildings`;
      }
    }
    if (!holdsAll(owner, offer.jailCards)) return `${side} does not hold those jail cards`;
  }
  return null;
}

function holdsAll(player: Player, cards: readonly DeckName[]): boolean {
  const held = [...player.heldJailCards];
  for (const card of cards) {
    const index = held.indexOf(card);
    if (index < 0) return false;
    held.splice(index, 1);
  }
  return true;
}

function without(held: readonly DeckName[], cards: readonly DeckName[]): DeckName[] {
  const rest = [...held];
  for (const card of cards) rest.splice(rest.indexOf(card), 1);
  return rest;
}

/** Swap the two offers between the two players. */
function execute(state: GameState, trade: Trade): GameState {
  const { fromId, toId, give, get } = trade;
  const from = getPlayer(state, fromId);
  const to = getPlayer(state, toId);
  let next = updatePlayer(state, fromId, {
    cash: from.cash - give.cash + get.cash,
    heldJailCards: [...without(from.heldJailCards, give.jailCards), ...get.jailCards],
  });
  next = updatePlayer(next, toId, {
    cash: to.cash + give.cash - get.cash,
    heldJailCards: [...without(to.heldJailCards, get.jailCards), ...give.jailCards],
  });
  for (const [squares, ownerId] of [
    [give.squares, toId],
    [get.squares, fromId],
  ] as const) {
    for (const square of squares) {
      const entry = entryOf(next, square);
      if (entry) next = setEntry(next, square, { ...entry, ownerId });
    }
  }
  return next;
}

const close = (state: GameState, trade: Trade): GameState => ({
  ...state,
  trade: null,
  turn: { ...state.turn, phase: trade.returnPhase },
});

/** Propose a trade. The partner then accepts or rejects, or the proposer cancels. */
export function handleProposeTrade(state: GameState, action: ActionOf<"ProposeTrade">): Result {
  const offer = {
    fromId: action.playerId,
    toId: action.toPlayerId,
    give: action.give,
    get: action.get,
  };
  const message = problem(state, offer);
  if (message) return fail("invalid_trade", message);

  const trade: Trade = { ...offer, returnPhase: state.turn.phase };
  const events: GameEvent[] = [
    {
      type: "TradeProposed",
      fromId: trade.fromId,
      toId: trade.toId,
      give: trade.give,
      get: trade.get,
    },
  ];
  return {
    ok: true,
    state: { ...state, trade, turn: { ...state.turn, phase: "awaiting_trade_response" } },
    events,
  };
}

export function handleAcceptTrade(state: GameState, _action: ActionOf<"AcceptTrade">): Result {
  const trade = state.trade;
  if (!trade) return fail("wrong_phase", "There is no open trade");
  const message = problem(state, trade);
  if (message) return fail("invalid_trade", message);

  const events: GameEvent[] = [{ type: "TradeAccepted", fromId: trade.fromId, toId: trade.toId }];
  let next = close(execute(state, trade), trade);

  // A trade can remove the assets a debtor counted on. Run the bankruptcy test again.
  const debtor = trade.fromId;
  if (
    trade.returnPhase === "awaiting_debt" &&
    liquidationValue(next, debtor) < outstanding(next, debtor)
  ) {
    next = declareInsolvent(
      next,
      debtor,
      next.debts.filter((d) => d.debtorId === debtor),
      events,
    );
  }
  return { ok: true, state: next, events };
}

export function handleRejectTrade(state: GameState, _action: ActionOf<"RejectTrade">): Result {
  const trade = state.trade;
  if (!trade) return fail("wrong_phase", "There is no open trade");
  const events: GameEvent[] = [{ type: "TradeRejected", fromId: trade.fromId, toId: trade.toId }];
  return { ok: true, state: close(state, trade), events };
}

export function handleCancelTrade(state: GameState, _action: ActionOf<"CancelTrade">): Result {
  const trade = state.trade;
  if (!trade) return fail("wrong_phase", "There is no open trade");
  const events: GameEvent[] = [{ type: "TradeCancelled", fromId: trade.fromId, toId: trade.toId }];
  return { ok: true, state: close(state, trade), events };
}
