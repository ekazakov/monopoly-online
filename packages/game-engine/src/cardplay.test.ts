import { describe, expect, test } from "vite-plus/test";
import type { GameEvent, GameState } from "./index.ts";
import {
  current,
  holding,
  landing,
  owns,
  ownerId,
  player,
  roll,
  setCurrent,
  topCard,
  types,
} from "./test-helpers.ts";

const cash = (state: GameState, id: string) => player(state, id).cash;
const me = (state: GameState) => cash(state, current(state));

// Chance cards by index: 0 Sail home, 1 Climb the hill, 3 Anchor day, 4 Next stop,
// 6 Nearest utility, 7 Trip to East Station, 8 Dividend, 10 Back three, 11 Marina fine,
// 12 Dock repairs, 13 Harbour master's party, 14 Go to Jail, 15 Get Out of Jail Free.
// Chest cards: 1 Bank error, 6 Festival.
// Chance squares: 7, 22, 36. Chest squares: 17, 33.
const onChance = (card: number, ...setups: Parameters<typeof landing>[2][]) =>
  landing(0, 7, topCard("chance", card), ...setups);

describe("drawing", () => {
  test("a used card goes to the bottom of the deck", () => {
    const state = onChance(8);
    const { state: after, events } = roll(state);
    expect(after.decks.chance).toHaveLength(16);
    expect(after.decks.chance.at(-1)).toBe(8);
    expect(after.decks.chance[0]).toBe(state.decks.chance[1]);
    expect(types(events)).toEqual(["DiceRolled", "PlayerMoved", "CardDrawn", "CashChanged"]);
  });

  test("Get Out of Jail Free is kept by the player", () => {
    const state = onChance(15);
    const { state: after } = roll(state);
    expect(player(after, current(state)).heldJailCards).toEqual(["chance"]);
    expect(after.decks.chance).toHaveLength(15);
    expect(after.decks.chance).not.toContain(15);
    expect(after.turn.phase).toBe("awaiting_end_turn");
  });
});

describe("money cards", () => {
  test("collect", () => {
    const state = onChance(8);
    expect(me(roll(state).state)).toBe(me(state) + 50);
  });

  test("pay the bank", () => {
    const state = onChance(11);
    expect(me(roll(state).state)).toBe(me(state) - 15);
  });

  test("a card payment the player cannot make at all is bankruptcy", () => {
    const state = onChance(11, setCurrent({ cash: 10 }));
    expect(player(roll(state).state, current(state)).active).toBe(false);
  });

  test("pay each other player", () => {
    const state = onChance(13);
    const { state: after } = roll(state);
    expect(me(after)).toBe(me(state) - 100);
    expect(cash(after, ownerId(state))).toBe(cash(state, ownerId(state)) + 50);
  });

  test("pay each other player without enough assets is bankruptcy", () => {
    const state = onChance(13, setCurrent({ cash: 60 }));
    const { state: after } = roll(state);
    expect(player(after, current(state)).active).toBe(false);
  });

  test("collect from each other player", () => {
    const state = landing(10, 7, topCard("chest", 6));
    const { state: after } = roll(state);
    expect(me(after)).toBe(me(state) + 20);
    expect(cash(after, ownerId(state))).toBe(cash(state, ownerId(state)) - 10);
  });

  test("Chance repairs charge per house and hotel", () => {
    const state = onChance(12, holding("current", { 1: { houses: 2 }, 3: { houses: 5 } }));
    expect(me(roll(state).state)).toBe(me(state) - (2 * 25 + 100));
  });

  test("Chest repairs charge their own amounts", () => {
    const state = landing(
      10,
      7,
      topCard("chest", 11),
      holding("current", { 1: { houses: 2 }, 3: { houses: 5 } }),
    );
    expect(me(roll(state).state)).toBe(me(state) - (2 * 40 + 115));
  });

  test("repairs ignore other players' buildings and cost nothing without buildings", () => {
    const state = onChance(12, holding("other", { 1: { houses: 3 } }));
    expect(me(roll(state).state)).toBe(me(state));
  });
});

describe("move cards", () => {
  test("Sail home goes to Start and pays the salary", () => {
    const state = onChance(0);
    const { state: after } = roll(state);
    expect(player(after, current(state)).position).toBe(0);
    expect(me(after)).toBe(me(state) + 200);
  });

  test("moving forward without passing Start pays nothing and lands normally", () => {
    const state = onChance(1);
    const { state: after } = roll(state);
    expect(player(after, current(state)).position).toBe(21);
    expect(me(after)).toBe(me(state));
    expect(after.turn.phase).toBe("awaiting_buy_decision");
  });

  test("moving past Start pays the salary", () => {
    const state = landing(14, 8, topCard("chance", 3));
    const { state: after } = roll(state);
    expect(player(after, current(state)).position).toBe(11);
    expect(me(after)).toBe(me(state) + 200);
  });

  test("a named station charges normal rent", () => {
    const state = onChance(7, owns(15));
    expect(me(roll(state).state)).toBe(me(state) - 25);
  });

  test("the nearest station charges double rent", () => {
    const state = onChance(4, owns(15));
    const { state: after } = roll(state);
    expect(player(after, current(state)).position).toBe(15);
    expect(me(after)).toBe(me(state) - 50);
    expect(cash(after, ownerId(state))).toBe(cash(state, ownerId(state)) + 50);
  });

  test("the nearest station wraps past Start and pays the salary", () => {
    const state = landing(30, 6, topCard("chance", 4));
    const { state: after } = roll(state);
    expect(player(after, current(state)).position).toBe(5);
    expect(me(after)).toBe(me(state) + 200);
    expect(after.turn.phase).toBe("awaiting_buy_decision");
  });

  test("the nearest utility charges 10 times a new roll", () => {
    const state = onChance(6, owns(12));
    const { state: after, events } = roll(state);
    const rolls = events.filter(
      (e): e is Extract<GameEvent, { type: "DiceRolled" }> => e.type === "DiceRolled",
    );
    expect(rolls).toHaveLength(2);
    const extra = rolls[1]?.dice ?? [0, 0];
    expect(me(after)).toBe(me(state) - 10 * (extra[0] + extra[1]));
    expect(player(after, current(state)).position).toBe(12);
    // The extra roll does not replace the turn's dice.
    expect(after.turn.dice).toEqual(rolls[0]?.dice);
  });

  test("Back three moves back and resolves the square, with no salary", () => {
    const state = onChance(10);
    const { state: after, events } = roll(state);
    expect(player(after, current(state)).position).toBe(4);
    expect(me(after)).toBe(me(state) - 200);
    expect(types(events)).toContain("TaxPaid");
  });

  test("Back three can land on Chest and draw again", () => {
    const state = landing(30, 6, topCard("chance", 10), topCard("chest", 1));
    const { state: after, events } = roll(state);
    expect(player(after, current(state)).position).toBe(33);
    expect(me(after)).toBe(me(state) + 200);
    expect(events.filter((e) => e.type === "CardDrawn")).toHaveLength(2);
  });

  test("Go to Jail card sends the token to Jail with no salary and ends the turn", () => {
    const state = onChance(14);
    const id = current(state);
    const { state: after } = roll(state);
    expect(player(after, id)).toMatchObject({ position: 10, inJail: true, cash: cash(state, id) });
    expect(after.turn.currentPlayerId).not.toBe(id);
  });
});
