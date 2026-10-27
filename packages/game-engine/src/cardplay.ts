import { BOARD_SIZE, SQUARES } from "./board.ts";
import { CHANCE_CARDS, CHEST_CARDS } from "./cards.ts";
import { charge, finishRoll, getPlayer, movePlayer, sendToJail, updatePlayer } from "./helpers.ts";
import type { Landing, LandingOptions } from "./landing.ts";
import { fail } from "./state.ts";
import type { DeckName, Failure, GameEvent, GameState } from "./state.ts";

/** Resolve a landing. Passed in by the caller, so this file does not import `landing.ts` code. */
type Land = (state: GameState, events: GameEvent[], options?: LandingOptions) => Landing;

const DECKS = { chance: CHANCE_CARDS, chest: CHEST_CARDS } as const;

const cannotPay = (amount: number): Failure =>
  // TODO(debt): replace this rejection with debt and bankruptcy.
  fail("insufficient_funds", `A player cannot pay $${amount}`);

function cashChange(state: GameState, playerId: string, amount: number, events: GameEvent[]) {
  events.push({ type: "CashChanged", playerId, amount, reason: "card" });
  return updatePlayer(state, playerId, { cash: getPlayer(state, playerId).cash + amount });
}

/** Squares ahead of `from` (wrapping) that match `kind`, nearest first. */
function nearest(from: number, kind: "station" | "utility"): number {
  for (let step = 1; step <= BOARD_SIZE; step++) {
    const square = (from + step) % BOARD_SIZE;
    if (SQUARES[square]?.kind === kind) return square;
  }
  throw new Error(`No ${kind} on the board`);
}

/** Draw the top card of a deck and do what it says. Ends in `finishRoll` or a landing. */
export function playCard(
  state: GameState,
  deck: DeckName,
  events: GameEvent[],
  land: Land,
): Landing {
  const player = getPlayer(state, state.turn.currentPlayerId);
  const [cardIndex, ...rest] = state.decks[deck];
  const card = cardIndex === undefined ? undefined : DECKS[deck][cardIndex];
  if (cardIndex === undefined || !card) throw new Error(`The ${deck} deck is empty`);
  events.push({ type: "CardDrawn", playerId: player.id, deck, cardIndex });

  const effect = card.effect;
  // A Get Out of Jail Free card is kept by the player. Other cards go to the bottom.
  const kept = effect.type === "jail_free";
  const drawn: GameState = {
    ...state,
    decks: { ...state.decks, [deck]: kept ? rest : [...rest, cardIndex] },
  };
  const others = drawn.players.filter((p) => p.active && p.id !== player.id);

  switch (effect.type) {
    case "jail_free": {
      const held = [...player.heldJailCards, deck];
      return ok(finishRoll(updatePlayer(drawn, player.id, { heldJailCards: held }), events));
    }

    case "collect":
      return ok(finishRoll(cashChange(drawn, player.id, effect.amount, events), events));

    case "pay": {
      if (!charge(drawn, player.id, effect.amount)) return cannotPay(effect.amount);
      return ok(finishRoll(cashChange(drawn, player.id, -effect.amount, events), events));
    }

    case "pay_each_player": {
      const total = effect.amount * others.length;
      if (!charge(drawn, player.id, total)) return cannotPay(total);
      let next = cashChange(drawn, player.id, -total, events);
      for (const other of others) next = cashChange(next, other.id, effect.amount, events);
      return ok(finishRoll(next, events));
    }

    case "collect_from_each_player": {
      const poor = others.find((p) => p.cash < effect.amount);
      if (poor) return cannotPay(effect.amount);
      let next = cashChange(drawn, player.id, effect.amount * others.length, events);
      for (const other of others) next = cashChange(next, other.id, -effect.amount, events);
      return ok(finishRoll(next, events));
    }

    case "repairs":
      // TODO(buildings): charge per house and hotel. Without buildings the player pays nothing.
      return ok(finishRoll(drawn, events));

    case "go_to_jail":
      return ok(finishRoll(sendToJail(drawn, player.id, events), events));

    case "move_to": {
      const moved = movePlayer(
        drawn,
        player.id,
        effect.square,
        events,
        effect.square < player.position,
      );
      return land(moved, events);
    }

    case "move_nearest": {
      const to = nearest(player.position, effect.target);
      const moved = movePlayer(drawn, player.id, to, events, to < player.position);
      const options: LandingOptions =
        effect.target === "station" ? { stationRentMultiplier: 2 } : { rollForUtility: true };
      return land(moved, events, options);
    }

    case "move_back": {
      const to = (player.position - effect.steps + BOARD_SIZE) % BOARD_SIZE;
      return land(movePlayer(drawn, player.id, to, events, false), events);
    }
  }
}

const ok = (state: GameState): Landing => ({ ok: true, state });
