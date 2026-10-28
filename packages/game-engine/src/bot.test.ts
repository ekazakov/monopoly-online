import { describe, expect, test } from "vite-plus/test";
import {
  actorFor,
  applyAction,
  CHANCE_CARDS,
  CHEST_CARDS,
  createGame,
  createRng,
  groupLevels,
  isProperty,
  JAIL_FINE,
  MIN_BID,
  nextInt,
  SQUARES,
} from "./index.ts";
import type { Action, GameState, RngState } from "./index.ts";

const DECKS = { chance: CHANCE_CARDS, chest: CHEST_CARDS } as const;

function assertInvariants(state: GameState) {
  for (const p of state.players) {
    expect(p.cash).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(p.position) && p.position >= 0 && p.position < SQUARES.length).toBe(
      true,
    );
    expect(p.inJail ? p.position === 10 : true).toBe(true);
    expect(p.jailTurns).toBeGreaterThanOrEqual(0);
    expect(p.jailTurns).toBeLessThan(3);
  }

  for (const [square, owner] of Object.entries(state.ownership)) {
    const found = SQUARES[Number(square)];
    expect(found !== undefined && isProperty(found)).toBe(true);
    expect(state.players.some((p) => p.id === owner.ownerId)).toBe(true);
  }

  for (const name of ["chance", "chest"] as const) {
    const list = state.decks[name];
    const held = state.players.flatMap((p) => p.heldJailCards).filter((d) => d === name).length;
    const jailIndex = DECKS[name].findIndex((c) => c.effect.type === "jail_free");
    expect(new Set(list).size).toBe(list.length);
    expect(list.length + held).toBe(DECKS[name].length);
    expect(held).toBeLessThanOrEqual(1);
    expect(list.includes(jailIndex)).toBe(held === 0);
  }

  const current = state.players.find((p) => p.id === state.turn.currentPlayerId);
  expect(current?.active).toBe(true);
}

/** Actions with no extra fields. The bot uses only these until it learns the rest. */
type PlainAction = Action extends infer A
  ? A extends Action
    ? Exclude<keyof A, "type" | "playerId"> extends never
      ? A
      : never
    : never
  : never;

/** Raise cash for a debt: sell a building, else mortgage a property, else pay. */
function debtAction(state: GameState, playerId: string): Action {
  const debt = state.debts.find((d) => d.debtorId === playerId);
  const player = state.players.find((p) => p.id === playerId);
  if (!debt || !player) throw new Error("no debt");
  if (player.cash >= debt.amount) return { type: "PayDebt", playerId };

  const owned = Object.entries(state.ownership)
    .filter(([, entry]) => entry.ownerId === playerId)
    .map(([square, entry]) => ({ square: Number(square), entry }))
    .sort((a, c) => a.square - c.square);
  const sellable = owned.find(({ square, entry }) => {
    const info = SQUARES[square];
    return (
      info?.kind === "street" &&
      entry.houses > 0 &&
      entry.houses === Math.max(...groupLevels(state, info.group))
    );
  });
  if (sellable) return { type: "SellBuilding", playerId, square: sellable.square };
  const mortgageable = owned.find(({ entry }) => !entry.mortgaged);
  if (mortgageable) return { type: "Mortgage", playerId, square: mortgageable.square };
  throw new Error(`Seed state: ${playerId} cannot raise cash for the debt`);
}

/** Pick a legal action. The bot has its own RNG, so it does not touch the game's RNG. */
function choose(state: GameState, rng: RngState): { action: Action; rng: RngState } {
  const playerId = actorFor(state);
  if (state.turn.phase === "awaiting_debt") return { action: debtAction(state, playerId), rng };
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error("no current player");
  const dice = nextInt(rng, 100);
  const pick = dice.value;
  if (state.turn.phase === "awaiting_bid") {
    // Bid the smallest legal amount about half of the time.
    const auction = state.auction;
    const amount = auction ? (auction.highBid === 0 ? MIN_BID : auction.highBid + 10) : 0;
    const bid = pick < 50 && player.cash >= amount;
    const action: Action = bid ? { type: "Bid", playerId, amount } : { type: "PassBid", playerId };
    return { action, rng: dice.rng };
  }
  const type = (): PlainAction["type"] => {
    switch (state.turn.phase) {
      case "awaiting_roll":
        return "RollDice";
      case "awaiting_end_turn":
        return "EndTurn";
      case "awaiting_buy_decision":
        return pick < 70 ? "BuyProperty" : "DeclineProperty";
      case "awaiting_jail_choice":
        if (player.heldJailCards.length > 0 && pick < 50) return "UseJailCard";
        if (player.cash >= JAIL_FINE && pick < 30) return "PayJailFine";
        return "RollDice";
      default:
        throw new Error(`Unexpected phase: ${state.turn.phase}`);
    }
  };
  return { action: { type: type(), playerId }, rng: dice.rng };
}

interface Run {
  state: GameState;
  actions: number;
  /** True when a payment the player could not make rejected the roll (debt is not built yet). */
  stalled: boolean;
  eventTypes: Set<string>;
}

function playGame(seed: number, maxActions: number): Run {
  let state = createGame({
    seed,
    players: [
      { id: "a", name: "Ann" },
      { id: "b", name: "Bo" },
      { id: "c", name: "Cy" },
      { id: "d", name: "Di" },
    ],
  });
  let rng = createRng(seed + 1000);
  const eventTypes = new Set<string>();
  let actions = 0;
  let stalled = false;

  while (actions < maxActions && state.turn.phase !== "game_over") {
    const choice = choose(state, rng);
    rng = choice.rng;
    const result = applyAction(state, choice.action);
    if (!result.ok) {
      if (result.error.code === "insufficient_funds") {
        stalled = true;
        break;
      }
      throw new Error(`Seed ${seed}: ${choice.action.type} rejected: ${result.error.message}`);
    }
    expect(result.state.version).toBe(state.version + 1);
    result.events.forEach((e) => eventTypes.add(e.type));
    state = result.state;
    actions++;
    assertInvariants(state);
  }
  return { state, actions, stalled, eventTypes };
}

describe("random bot games", () => {
  const seeds = Array.from({ length: 60 }, (_, i) => i);
  const runs = seeds.map((seed) => playGame(seed, 3000));

  test("invariants hold in every state of every game", () => {
    expect(runs.every((r) => r.actions > 0)).toBe(true);
  });

  test("the bot reaches the main rules", () => {
    const seen = new Set(runs.flatMap((r) => [...r.eventTypes]));
    const expected = [
      "DiceRolled",
      "PlayerMoved",
      "PassedGo",
      "PropertyBought",
      "RentPaid",
      "TaxPaid",
      "CardDrawn",
      "CashChanged",
      "SentToJail",
      "LeftJail",
      "FinePaid",
      "TurnEnded",
    ];
    expect(expected.filter((type) => !seen.has(type))).toEqual([]);
  });

  test("games run for many turns", () => {
    const total = runs.reduce((sum, r) => sum + r.actions, 0);
    expect(total).toBeGreaterThan(5000);
  });

  test("the same seed gives the same game", () => {
    const again = playGame(7, 3000);
    const first = runs[7];
    expect(again.actions).toBe(first?.actions);
    expect(again.state).toEqual(first?.state);
  });

  test("final states are plain JSON", () => {
    for (const run of runs) {
      expect(JSON.parse(JSON.stringify(run.state))).toEqual(run.state);
    }
  });
});
