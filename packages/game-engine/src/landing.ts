import type { ActionOf } from "./actions.ts";
import { isProperty, SQUARES, STATION_RENT, UTILITY_MULTIPLIER } from "./board.ts";
import { playCard } from "./cardplay.ts";
import { owe } from "./debt.ts";
import { charge, finishRoll, getPlayer, sendToJail } from "./helpers.ts";
import { entryOf, ownedInGroup, ownerOf, ownsFullGroup, setEntry } from "./ownership.ts";
import { rollDice } from "./rng.ts";
import { fail } from "./state.ts";
import type { Failure, GameEvent, GameState, Result } from "./state.ts";

export type Landing = { readonly ok: true; readonly state: GameState } | Failure;

/**
 * Rent for an owned property square: 0 when it is unowned or mortgaged.
 * `diceTotal` is used for utilities.
 */
export function rentFor(state: GameState, position: number, diceTotal: number): number {
  const square = SQUARES[position];
  const entry = entryOf(state, position);
  if (!square || !isProperty(square) || !entry || entry.mortgaged) return 0;
  const owned = ownedInGroup(state, square.group, entry.ownerId);
  if (square.kind === "station") return STATION_RENT[owned - 1] ?? 0;
  if (square.kind === "utility") return (UTILITY_MULTIPLIER[owned - 1] ?? 0) * diceTotal;
  if (entry.houses > 0) return square.rent[entry.houses] ?? 0;
  // A street with no buildings of its own pays double when the owner holds the full group.
  return ownsFullGroup(state, square.group, entry.ownerId) ? square.rent[0] * 2 : square.rent[0];
}

const BANK = { type: "bank" } as const;

/** Rules a card can change for the landing that follows it. */
export interface LandingOptions {
  /** Multiplier for station rent. */
  stationRentMultiplier?: number;
  /** Roll the dice for utility rent, and pay 10 times the total. */
  rollForUtility?: boolean;
}

/** Resolve the square the current player landed on. Ends in `finishRoll` or a buy decision. */
export function resolveLanding(
  state: GameState,
  events: GameEvent[],
  options: LandingOptions = {},
): Landing {
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
      return playCard(state, square.kind, events, resolveLanding);

    case "go_to_jail":
      return { ok: true, state: finishRoll(sendToJail(state, player.id, events), events) };

    case "tax": {
      const owed = owe(
        state,
        player.id,
        { creditor: BANK, amount: square.amount, reason: "tax" },
        events,
        "finish_roll",
      );
      if (!owed.ok) return owed;
      if (!owed.settled) return { ok: true, state: owed.state };
      events.push({
        type: "TaxPaid",
        playerId: player.id,
        square: player.position,
        amount: square.amount,
      });
      return { ok: true, state: finishRoll(owed.state, events) };
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
      if (ownerId === player.id || entryOf(state, player.position)?.mortgaged) {
        return { ok: true, state: finishRoll(state, events) };
      }

      let working = state;
      let amount: number;
      if (square.kind === "utility" && options.rollForUtility) {
        const roll = rollDice(state.rng);
        events.push({ type: "DiceRolled", playerId: player.id, dice: roll.value });
        working = { ...state, rng: roll.rng };
        amount = 10 * (roll.value[0] + roll.value[1]);
      } else {
        const diceTotal = (state.turn.dice?.[0] ?? 0) + (state.turn.dice?.[1] ?? 0);
        const multiplier = square.kind === "station" ? (options.stationRentMultiplier ?? 1) : 1;
        amount = rentFor(state, player.position, diceTotal) * multiplier;
      }
      const owed = owe(
        working,
        player.id,
        { creditor: { type: "player", id: ownerId }, amount, reason: "rent" },
        events,
        "finish_roll",
      );
      if (!owed.ok) return owed;
      if (!owed.settled) return { ok: true, state: owed.state };
      events.push({
        type: "RentPaid",
        payerId: player.id,
        ownerId,
        square: player.position,
        amount,
      });
      return { ok: true, state: finishRoll(owed.state, events) };
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
  const owned = setEntry(paid, player.position, {
    ownerId: player.id,
    houses: 0,
    mortgaged: false,
  });
  return { ok: true, state: finishRoll(owned, events), events };
}

export function handleDeclineProperty(state: GameState): Result {
  // TODO(auction): the property should go to auction. For now it stays unowned.
  const events: GameEvent[] = [];
  return { ok: true, state: finishRoll(state, events), events };
}
