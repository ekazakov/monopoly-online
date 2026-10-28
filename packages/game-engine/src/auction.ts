import type { ActionOf } from "./actions.ts";
import { charge, getPlayer } from "./helpers.ts";
import { setEntry } from "./ownership.ts";
import { fail } from "./state.ts";
import type { Auction, AuctionThen, GameEvent, GameState, Result } from "./state.ts";
import { finishRoll } from "./turnflow.ts";

export const MIN_BID = 10;
/** A raise adds one of these amounts to the best bid. */
export const RAISES = [10, 50, 100] as const;

const nextMinimum = (auction: Auction) => (auction.highBid === 0 ? MIN_BID : auction.highBid + 10);

/**
 * Start an auction for a property. Every active player bids, in seat order, starting with the
 * player on turn. A player who cannot afford the opening bid passes at once. If nobody can bid,
 * the auction ends at once and the property stays unowned.
 */
export function startAuction(
  state: GameState,
  square: number,
  then: AuctionThen,
  events: GameEvent[],
): GameState {
  const count = state.players.length;
  const first = state.players.findIndex((p) => p.id === state.turn.currentPlayerId);
  const bidderOrder: string[] = [];
  for (let step = 0; step < count; step++) {
    const player = state.players[(first + step) % count];
    if (player?.active) bidderOrder.push(player.id);
  }
  events.push({ type: "AuctionStarted", square, bidderIds: bidderOrder });

  const passed = bidderOrder.filter((id) => getPlayer(state, id).cash < MIN_BID);
  for (const id of passed) events.push({ type: "BidPassed", playerId: id, auto: true });
  const actorId = bidderOrder.find((id) => !passed.includes(id));
  const auction: Auction = {
    square,
    bidderOrder,
    passed,
    highBid: 0,
    highBidderId: null,
    actorId: actorId ?? "",
    then,
  };
  if (actorId === undefined) return endAuction(state, auction, events);
  return { ...state, auction, turn: { ...state.turn, phase: "awaiting_bid" } };
}

/** The winner pays the bank and gets the deed. Without a bid the property stays unowned. */
function endAuction(state: GameState, auction: Auction, events: GameEvent[]): GameState {
  const winnerId = auction.highBidderId;
  let next: GameState = { ...state, auction: null };
  if (winnerId !== null) {
    const paid = charge(next, winnerId, auction.highBid);
    if (!paid) throw new Error("The winner cannot pay: bids are capped by cash");
    next = setEntry(paid, auction.square, { ownerId: winnerId, houses: 0, mortgaged: false });
  }
  events.push({
    type: "AuctionEnded",
    square: auction.square,
    winnerId,
    price: winnerId === null ? 0 : auction.highBid,
  });
  switch (auction.then) {
    case "finish_roll":
      return finishRoll(next, events);
  }
}

/**
 * Pass the turn to act to the next bidder after `from`. The best bidder does not act again
 * until someone raises. A bidder who cannot afford the next minimum bid passes at once.
 * When nobody is left to act, the auction ends.
 */
function advance(state: GameState, auction: Auction, from: string, events: GameEvent[]): GameState {
  const order = auction.bidderOrder;
  const start = order.indexOf(from);
  const passed = [...auction.passed];
  for (let step = 1; step <= order.length; step++) {
    const id = order[(start + step) % order.length] ?? "";
    if (passed.includes(id) || id === auction.highBidderId) continue;
    if (getPlayer(state, id).cash < nextMinimum(auction)) {
      passed.push(id);
      events.push({ type: "BidPassed", playerId: id, auto: true });
      continue;
    }
    return {
      ...state,
      auction: { ...auction, passed, actorId: id },
      turn: { ...state.turn, phase: "awaiting_bid" },
    };
  }
  return endAuction(state, { ...auction, passed }, events);
}

export function handleBid(state: GameState, action: ActionOf<"Bid">): Result {
  const auction = state.auction;
  if (!auction) return fail("wrong_phase", "There is no auction");
  const { amount } = action;
  const cash = getPlayer(state, action.playerId).cash;

  if (!Number.isInteger(amount) || amount > cash) {
    return fail("invalid_bid", "A bid must be a whole number, and no more than the bidder's cash");
  }
  const valid =
    auction.highBid === 0
      ? amount >= MIN_BID
      : RAISES.some((raise) => amount === auction.highBid + raise);
  if (!valid) {
    return fail(
      "invalid_bid",
      auction.highBid === 0
        ? `The opening bid is at least $${MIN_BID}`
        : `Raise the best bid ($${auction.highBid}) by $10, $50 or $100`,
    );
  }

  const events: GameEvent[] = [{ type: "BidPlaced", playerId: action.playerId, amount }];
  const raised: Auction = { ...auction, highBid: amount, highBidderId: action.playerId };
  return { ok: true, state: advance(state, raised, action.playerId, events), events };
}

/** A pass is final: the player cannot bid again in this auction. */
export function handlePassBid(state: GameState, action: ActionOf<"PassBid">): Result {
  const auction = state.auction;
  if (!auction) return fail("wrong_phase", "There is no auction");
  const events: GameEvent[] = [{ type: "BidPassed", playerId: action.playerId, auto: false }];
  const passed: Auction = { ...auction, passed: [...auction.passed, action.playerId] };
  return { ok: true, state: advance(state, passed, action.playerId, events), events };
}
