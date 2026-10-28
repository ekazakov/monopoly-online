import { BOARD_SIZE, SQUARES } from "./board.ts";
import { CHANCE_CARDS, CHEST_CARDS } from "./cards.ts";
import { getPlayer, movePlayer, sendToJail, updatePlayer } from "./helpers.ts";
import { finishRoll } from "./turnflow.ts";
import type { Landing, LandingOptions } from "./landing.ts";
import { owe, oweMany } from "./debt.ts";
import type { Charge } from "./debt.ts";
import { buildingCounts } from "./ownership.ts";
import type { DeckName, GameEvent, GameState } from "./state.ts";

/** Resolve a landing. Passed in by the caller, so this file does not import `landing.ts` code. */
type Land = (state: GameState, events: GameEvent[], options?: LandingOptions) => Landing;

const DECKS = { chance: CHANCE_CARDS, chest: CHEST_CARDS } as const;

/** The player owes the bank. Pay at once, or become a debtor. */
function payBank(state: GameState, playerId: string, amount: number, events: GameEvent[]): Landing {
  const owed = owe(
    state,
    playerId,
    { creditor: { type: "bank" }, amount, reason: "card" },
    events,
    "finish_roll",
  );
  if (!owed.ok) return owed;
  if (!owed.settled) return ok(owed.state);
  events.push({ type: "CashChanged", playerId, amount: -amount, reason: "card" });
  return ok(finishRoll(owed.state, events));
}

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

    case "pay":
      return payBank(drawn, player.id, effect.amount, events);

    case "pay_each_player": {
      // One total for all creditors, so the cash and the liquidation tests see the whole amount.
      const charges: Charge[] = others.map((other) => ({
        creditor: { type: "player", id: other.id },
        amount: effect.amount,
        reason: "card",
      }));
      const owed = oweMany(drawn, player.id, charges, events, "finish_roll");
      if (!owed.ok) return owed;
      if (!owed.settled) return ok(owed.state);
      events.push({
        type: "CashChanged",
        playerId: player.id,
        amount: -effect.amount * others.length,
        reason: "card",
      });
      for (const other of others) {
        events.push({
          type: "CashChanged",
          playerId: other.id,
          amount: effect.amount,
          reason: "card",
        });
      }
      return ok(finishRoll(owed.state, events));
    }

    case "collect_from_each_player": {
      // A player who cannot pay now may owe the debt until their own turn starts.
      let next = drawn;
      for (const other of others) {
        const owed = oweMany(
          next,
          other.id,
          [{ creditor: { type: "player", id: player.id }, amount: effect.amount, reason: "card" }],
          events,
          "due_at_turn_start",
        );
        if (!owed.ok) return owed;
        next = owed.state;
        if (!owed.settled) continue;
        events.push({
          type: "CashChanged",
          playerId: other.id,
          amount: -effect.amount,
          reason: "card",
        });
        events.push({
          type: "CashChanged",
          playerId: player.id,
          amount: effect.amount,
          reason: "card",
        });
      }
      return ok(finishRoll(next, events));
    }

    case "repairs": {
      const { houses, hotels } = buildingCounts(drawn, player.id);
      const amount = houses * effect.perHouse + hotels * effect.perHotel;
      if (amount === 0) return ok(finishRoll(drawn, events));
      return payBank(drawn, player.id, amount, events);
    }

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
