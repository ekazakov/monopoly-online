import { describe, expect, test } from "vite-plus/test";
import { applyAction } from "./index.ts";
import type { GameState } from "./index.ts";
import {
  current,
  gameWhere,
  holding,
  isDouble,
  landing,
  owns,
  ownerId,
  player,
  roll,
  setCurrent,
  types,
} from "./test-helpers.ts";

const cash = (state: GameState, id: string) => player(state, id).cash;
const act = (state: GameState, type: "BuyProperty" | "DeclineProperty") =>
  applyAction(state, { type, playerId: current(state) });

describe("tax, Free Parking and Go to Jail", () => {
  test("Income Tax takes $200", () => {
    const state = landing(0, 4);
    const { state: after, events } = roll(state);
    expect(cash(after, current(state))).toBe(cash(state, current(state)) - 200);
    expect(types(events)).toEqual(["DiceRolled", "PlayerMoved", "TaxPaid"]);
    expect(after.turn.phase).toBe("awaiting_end_turn");
  });

  test("Luxury Tax takes $100", () => {
    const state = landing(30, 8);
    expect(cash(roll(state).state, current(state))).toBe(cash(state, current(state)) - 100);
  });

  test("a player who cannot pay a tax is rejected (temporary)", () => {
    const state = landing(0, 4, setCurrent({ cash: 100 }));
    expect(applyAction(state, { type: "RollDice", playerId: current(state) })).toMatchObject({
      ok: false,
      error: { code: "insufficient_funds" },
    });
  });

  test("Free Parking does nothing", () => {
    const state = landing(14, 6);
    const { state: after } = roll(state);
    expect(cash(after, current(state))).toBe(cash(state, current(state)));
    expect(after.turn.phase).toBe("awaiting_end_turn");
  });

  test("Go to Jail sends the token to Jail with no salary and ends the turn", () => {
    const state = landing(24, 6);
    const id = current(state);
    const { state: after, events } = roll(state);
    expect(player(after, id)).toMatchObject({ position: 10, inJail: true, cash: cash(state, id) });
    expect(after.turn.currentPlayerId).not.toBe(id);
    expect(types(events)).toEqual([
      "DiceRolled",
      "PlayerMoved",
      "PlayerMoved",
      "SentToJail",
      "TurnEnded",
    ]);
  });
});

describe("buying", () => {
  test("landing on an unowned property asks for a decision", () => {
    const { state: after } = roll(landing(0, 3));
    expect(after.turn.phase).toBe("awaiting_buy_decision");
  });

  test("buying takes the price and gives the deed", () => {
    const state = roll(landing(0, 3)).state;
    const id = current(state);
    const result = act(state, "BuyProperty");
    expect(result.ok && result.state.ownership["3"]).toEqual({
      ownerId: id,
      houses: 0,
      mortgaged: false,
    });
    expect(result.ok && cash(result.state, id)).toBe(cash(state, id) - 60);
    expect(result.ok && result.state.turn.phase).toBe("awaiting_end_turn");
    expect(result.ok && types(result.events)).toEqual(["PropertyBought"]);
  });

  test("declining leaves the property unowned (temporary, no auction yet)", () => {
    const state = roll(landing(0, 3)).state;
    const result = act(state, "DeclineProperty");
    expect(result.ok && result.state.ownership).toEqual({});
    expect(result.ok && result.state.turn.phase).toBe("awaiting_end_turn");
  });

  test("a player who cannot afford the price skips the decision", () => {
    const state = landing(0, 3, setCurrent({ cash: 50 }));
    const { state: after } = roll(state);
    expect(after.turn.phase).toBe("awaiting_end_turn");
    expect(after.ownership).toEqual({});
  });

  test("buying without enough cash is rejected", () => {
    const state = roll(landing(0, 3)).state;
    const poor = setCurrent({ cash: 10 })(state);
    expect(act(poor, "BuyProperty")).toMatchObject({
      ok: false,
      error: { code: "insufficient_funds" },
    });
  });

  test("buying after a double gives another roll", () => {
    const state = gameWhere((d) => d[0] === 3 && d[1] === 3, setCurrent({ position: 0 }));
    const bought = act(roll(state).state, "BuyProperty");
    expect(bought.ok && bought.state.turn).toMatchObject({ phase: "awaiting_roll", doubles: 1 });
  });
});

describe("rent", () => {
  test("a street pays base rent", () => {
    const state = landing(0, 3, owns(3));
    const { state: after, events } = roll(state);
    expect(cash(after, current(state))).toBe(cash(state, current(state)) - 4);
    expect(cash(after, ownerId(state))).toBe(cash(state, ownerId(state)) + 4);
    expect(types(events)).toEqual(["DiceRolled", "PlayerMoved", "RentPaid"]);
    expect(after.turn.phase).toBe("awaiting_end_turn");
  });

  test("a full colour group doubles the base rent", () => {
    const state = landing(0, 3, owns(1, 3));
    expect(cash(roll(state).state, current(state))).toBe(cash(state, current(state)) - 8);
  });

  test("stations pay by the number owned", () => {
    const one = landing(0, 5, owns(5));
    expect(cash(roll(one).state, current(one))).toBe(cash(one, current(one)) - 25);
    const two = landing(0, 5, owns(5, 15));
    expect(cash(roll(two).state, current(two))).toBe(cash(two, current(two)) - 50);
  });

  test("utilities pay 4 or 10 times the dice total", () => {
    const one = landing(5, 7, owns(12));
    expect(cash(roll(one).state, current(one))).toBe(cash(one, current(one)) - 28);
    const both = landing(5, 7, owns(12, 28));
    expect(cash(roll(both).state, current(both))).toBe(cash(both, current(both)) - 70);
  });

  test("an owner in Jail still collects", () => {
    const jailOwner: typeof owns =
      (...squares) =>
      (state) => {
        const owned = owns(...squares)(state);
        return {
          ...owned,
          players: owned.players.map((p) => (p.id === ownerId(state) ? { ...p, inJail: true } : p)),
        };
      };
    const state = landing(0, 3, jailOwner(3));
    expect(cash(roll(state).state, ownerId(state))).toBe(cash(state, ownerId(state)) + 4);
  });

  test("no rent on your own property", () => {
    const own: typeof owns =
      (...squares) =>
      (state) => {
        const owned = owns(...squares)(state);
        const ownership = Object.fromEntries(
          squares.map((s) => [String(s), { ownerId: current(state), houses: 0, mortgaged: false }]),
        );
        return { ...owned, ownership };
      };
    const state = landing(0, 3, own(3));
    const { state: after, events } = roll(state);
    expect(cash(after, current(state))).toBe(cash(state, current(state)));
    expect(types(events)).toEqual(["DiceRolled", "PlayerMoved"]);
  });

  test("a player who cannot pay rent and has no assets to cover it goes bankrupt", () => {
    const state = landing(0, 3, owns(3), setCurrent({ cash: 2 }));
    const { state: after } = roll(state);
    expect(player(after, current(state)).active).toBe(false);
  });
});

describe("rules sanity", () => {
  test("rolling a double onto a taxed square still pays and rolls again", () => {
    const state = gameWhere((d) => isDouble(d) && d[0] === 2, setCurrent({ position: 0 }));
    const { state: after } = roll(state);
    expect(cash(after, current(state))).toBe(cash(state, current(state)) - 200);
    expect(after.turn).toMatchObject({ phase: "awaiting_roll", doubles: 1 });
  });
});

describe("rent with buildings and mortgages", () => {
  const owed = (state: GameState) =>
    cash(state, current(state)) - cash(roll(state).state, current(state));

  test("houses raise a street's rent", () => {
    expect(owed(landing(0, 3, holding("other", { 1: {}, 3: { houses: 2 } })))).toBe(60);
  });

  test("a hotel pays the hotel rent", () => {
    expect(owed(landing(0, 3, holding("other", { 1: { houses: 4 }, 3: { houses: 5 } })))).toBe(450);
  });

  test("a street with no buildings still pays double beside a built sibling", () => {
    expect(owed(landing(0, 3, holding("other", { 1: { houses: 1 }, 3: {} })))).toBe(8);
  });

  test("a mortgaged street pays no rent and sends no event", () => {
    const state = landing(0, 3, holding("other", { 3: { mortgaged: true } }));
    const { events } = roll(state);
    expect(owed(state)).toBe(0);
    expect(types(events)).toEqual(["DiceRolled", "PlayerMoved"]);
  });

  test("a mortgaged sibling does not remove the full-group double", () => {
    expect(owed(landing(0, 3, holding("other", { 1: { mortgaged: true }, 3: {} })))).toBe(8);
  });

  test("a mortgaged station pays no rent", () => {
    expect(owed(landing(0, 5, holding("other", { 5: { mortgaged: true } })))).toBe(0);
  });

  test("a mortgaged station still counts for the other stations' rent", () => {
    expect(owed(landing(0, 5, holding("other", { 5: {}, 15: { mortgaged: true } })))).toBe(50);
  });
});
