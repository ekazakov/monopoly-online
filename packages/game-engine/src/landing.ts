import type { ActionOf } from "./actions.ts";
import { groupSquares, SQUARES, STATION_RENT, UTILITY_MULTIPLIER } from "./board.ts";
import type { PropertySquare } from "./board.ts";
import { finishRoll, getPlayer, sendToJail, updatePlayer } from "./helpers.ts";
import { fail } from "./state.ts";
import type { Failure, GameEvent, GameState, Result } from "./state.ts";

export type Landing = { readonly ok: true; readonly state: GameState } | Failure;

const key = (square: number) => String(square);
const ownerOf = (state: GameState, square: number) => state.ownership[key(square)]?.ownerId;

function ownedCount(state: GameState, group: PropertySquare["group"], ownerId: string): number {
  return groupSquares(group).filter((square) => ownerOf(state, square) === ownerId).length;
}

/** Rent for a property square. The owner must own it. `diceTotal` is used for utilities. */
export function rentFor(
  state: GameState,
  square: PropertySquare,
  ownerId: string,
  diceTotal: number,
): number {
  const owned = ownedCount(state, square.group, ownerId);
  if (square.kind === "station") return STATION_RENT[owned - 1] ?? 0;
  if (square.kind === "utility") return (UTILITY_MULTIPLIER[owned - 1] ?? 0) * diceTotal;
  // Buildings are not built yet, so a street always pays its base rent (doubled for a full group).
  const fullGroup = owned === groupSquares(square.group).length;
  return fullGroup ? square.rent[0] * 2 : square.rent[0];
}

/** Take money from a player. Returns null when the player cannot pay. */
function charge(state: GameState, playerId: string, amount: number): GameState | null {
  const player = getPlayer(state, playerId);
  if (player.cash < amount) return null;
  return updatePlayer(state, playerId, { cash: player.cash - amount });
}

const cannotPay = (amount: number): Failure =>
  // TODO(debt): replace this rejection with debt and bankruptcy.
  fail("insufficient_funds", `The player cannot pay $${amount}`);

/** Resolve the square the current player landed on. Ends in `finishRoll` or a buy decision. */
export function resolveLanding(state: GameState, events: GameEvent[]): Landing {
  const player = getPlayer(state, state.turn.currentPlayerId);
  const square = SQUARES[player.position];
  if (!square) throw new Error(`No square at ${player.position}`);

  switch (square.kind) {
    case "go":
    case "jail":
    case "free_parking":
      return { ok: true, state: finishRoll(state, events) };

    case "chance":
    case "chest":
      // TODO(task 8): draw and apply a card.
      return { ok: true, state: finishRoll(state, events) };

    case "go_to_jail":
      return { ok: true, state: finishRoll(sendToJail(state, player.id, events), events) };

    case "tax": {
      const paid = charge(state, player.id, square.amount);
      if (!paid) return cannotPay(square.amount);
      events.push({
        type: "TaxPaid",
        playerId: player.id,
        square: player.position,
        amount: square.amount,
      });
      return { ok: true, state: finishRoll(paid, events) };
    }

    case "street":
    case "station":
    case "utility": {
      const ownerId = ownerOf(state, player.position);
      if (ownerId === undefined) {
        // TODO(auction): a player who cannot afford the price should start an auction.
        if (player.cash < square.price) return { ok: true, state: finishRoll(state, events) };
        return {
          ok: true,
          state: { ...state, turn: { ...state.turn, phase: "awaiting_buy_decision" } },
        };
      }
      if (ownerId === player.id) return { ok: true, state: finishRoll(state, events) };

      const diceTotal = (state.turn.dice?.[0] ?? 0) + (state.turn.dice?.[1] ?? 0);
      const amount = rentFor(state, square, ownerId, diceTotal);
      const paid = charge(state, player.id, amount);
      if (!paid) return cannotPay(amount);
      const owner = getPlayer(paid, ownerId);
      events.push({
        type: "RentPaid",
        payerId: player.id,
        ownerId,
        square: player.position,
        amount,
      });
      const settled = updatePlayer(paid, ownerId, { cash: owner.cash + amount });
      return { ok: true, state: finishRoll(settled, events) };
    }
  }
}

export function handleBuyProperty(state: GameState, action: ActionOf<"BuyProperty">): Result {
  const player = getPlayer(state, action.playerId);
  const square = SQUARES[player.position];
  if (
    !square ||
    !(square.kind === "street" || square.kind === "station" || square.kind === "utility")
  ) {
    return fail("wrong_phase", "There is no property to buy here");
  }
  if (ownerOf(state, player.position) !== undefined) {
    return fail("wrong_phase", "This property already has an owner");
  }
  const paid = charge(state, player.id, square.price);
  if (!paid) return fail("insufficient_funds", `The player cannot pay $${square.price}`);

  const events: GameEvent[] = [
    { type: "PropertyBought", playerId: player.id, square: player.position, price: square.price },
  ];
  const owned: GameState = {
    ...paid,
    ownership: { ...paid.ownership, [key(player.position)]: { ownerId: player.id } },
  };
  return { ok: true, state: finishRoll(owned, events), events };
}

export function handleDeclineProperty(state: GameState): Result {
  // TODO(auction): the property should go to auction. For now it stays unowned.
  const events: GameEvent[] = [];
  return { ok: true, state: finishRoll(state, events), events };
}
