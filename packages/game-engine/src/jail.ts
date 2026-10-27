import type { ActionOf } from "./actions.ts";
import { BOARD_SIZE, JAIL_SQUARE } from "./board.ts";
import { CHANCE_CARDS, CHEST_CARDS } from "./cards.ts";
import { advanceTurn, charge, movePlayer, updatePlayer } from "./helpers.ts";
import { resolveLanding } from "./landing.ts";
import { rollDice } from "./rng.ts";
import { fail, JAIL_FINE, MAX_JAIL_ATTEMPTS } from "./state.ts";
import type { GameEvent, GameState, Player, Result } from "./state.ts";

const DECKS = { chance: CHANCE_CARDS, chest: CHEST_CARDS } as const;

const cannotPayFine = () =>
  // TODO(debt): replace this rejection with debt and bankruptcy.
  fail("insufficient_funds", `The player cannot pay the $${JAIL_FINE} fine`);

function leaveJail(state: GameState, playerId: string, events: GameEvent[]): GameState {
  events.push({ type: "LeftJail", playerId });
  return updatePlayer(state, playerId, { inJail: false, jailTurns: 0 });
}

/** Pay $50 before rolling. The player then rolls as in a normal turn. */
export function handlePayJailFine(state: GameState, action: ActionOf<"PayJailFine">): Result {
  const paid = charge(state, action.playerId, JAIL_FINE);
  if (!paid) return cannotPayFine();
  const events: GameEvent[] = [{ type: "FinePaid", playerId: action.playerId, amount: JAIL_FINE }];
  const free = leaveJail(paid, action.playerId, events);
  return {
    ok: true,
    state: { ...free, turn: { ...free.turn, phase: "awaiting_roll" } },
    events,
  };
}

/** Use a Get Out of Jail Free card before rolling. The card goes to the bottom of its deck. */
export function handleUseJailCard(state: GameState, action: ActionOf<"UseJailCard">): Result {
  const player = state.players.find((p) => p.id === action.playerId);
  const deck = player?.heldJailCards[0];
  if (!player || deck === undefined) return fail("no_jail_card", "The player has no jail card");

  const cardIndex = DECKS[deck].findIndex((card) => card.effect.type === "jail_free");
  const events: GameEvent[] = [];
  const free = leaveJail(
    {
      ...updatePlayer(state, player.id, { heldJailCards: player.heldJailCards.slice(1) }),
      decks: { ...state.decks, [deck]: [...state.decks[deck], cardIndex] },
    },
    player.id,
    events,
  );
  return {
    ok: true,
    state: { ...free, turn: { ...free.turn, phase: "awaiting_roll" } },
    events,
  };
}

/**
 * Roll for doubles instead of paying. A double frees the player, who moves the roll and does
 * not roll again. A miss keeps the player in Jail and ends the turn. After the third miss the
 * fine is mandatory, and the player moves the number just rolled.
 */
export function handleJailRoll(state: GameState, player: Player): Result {
  const roll = rollDice(state.rng);
  const [first, second] = roll.value;
  const events: GameEvent[] = [{ type: "DiceRolled", playerId: player.id, dice: roll.value }];
  // `doubles` stays 0, so a double that frees the player gives no extra roll.
  const rolled: GameState = {
    ...state,
    rng: roll.rng,
    turn: { ...state.turn, dice: roll.value, doubles: 0 },
  };

  let next = rolled;
  if (first !== second) {
    const failed = player.jailTurns + 1;
    if (failed < MAX_JAIL_ATTEMPTS) {
      next = updatePlayer(rolled, player.id, { jailTurns: failed });
      return { ok: true, state: advanceTurn(next, events), events };
    }
    const paid = charge(rolled, player.id, JAIL_FINE);
    if (!paid) return cannotPayFine();
    events.push({ type: "FinePaid", playerId: player.id, amount: JAIL_FINE });
    next = paid;
  }

  next = leaveJail(next, player.id, events);
  const to = (JAIL_SQUARE + first + second) % BOARD_SIZE;
  next = movePlayer(next, player.id, to, events, JAIL_SQUARE + first + second >= BOARD_SIZE);
  const landed = resolveLanding(next, events);
  if (!landed.ok) return landed;
  return { ok: true, state: landed.state, events };
}
