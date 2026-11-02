import { applyAction } from "@monopoly/game-engine";
import type { ActionType, GameState } from "@monopoly/game-engine";
import { describe, expect, test } from "vite-plus/test";
import { recordFixture } from "../../../game/fixtures.ts";
import { BEACON_HILL, NORTH_STATION, POWER_WORKS, SKY, deal, skyWith } from "./fixtures.ts";
import type { DealSpec, Who } from "./fixtures.ts";
import { MANAGE_ACTIONS, propertyActions } from "./propertyActions.ts";

const sky = (spec: DealSpec = {}) => deal({ deeds: skyWith([0, 0, 0]), ...spec });

function actionsOf(game: ReturnType<typeof deal>, square: number, who: Who = "a") {
  return propertyActions(game.state, game.id(who), square);
}

describe("propertyActions: a full colour set", () => {
  const game = sky();

  test("builds, mortgages, and refuses what does not apply", () => {
    const a = actionsOf(game, 6);
    expect(a).toMatchObject({
      canBuild: true,
      canSell: false,
      canMortgage: true,
      canUnmortgage: false,
      manageable: true,
      notNow: null,
    });
    expect(a.reason).toEqual({
      build: null,
      sell: "No buildings to sell",
      mortgage: null,
      unmortgage: "Not mortgaged",
    });
  });

  test("costs come from the board data", () => {
    expect(actionsOf(game, 6).cost).toEqual({ build: 50, sell: 25, mortgage: 50, unmortgage: 55 });
    expect(actionsOf(game, 9).cost).toEqual({ build: 50, sell: 25, mortgage: 60, unmortgage: 66 });
    const red = deal({ deeds: [[BEACON_HILL, "a"]] });
    expect(actionsOf(red, BEACON_HILL).cost).toEqual({
      build: 150,
      sell: 75,
      mortgage: 110,
      unmortgage: 121,
    });
  });
});

describe("propertyActions: building rules", () => {
  test("an incomplete set cannot be built on, but can be mortgaged", () => {
    const game = deal({
      deeds: [
        [6, "a"],
        [8, "a"],
        [9, "b"],
      ],
    });
    const a = actionsOf(game, 6);
    expect(a.canBuild).toBe(false);
    expect(a.reason.build).toBe("Needs the full Sky set");
    expect(a.canMortgage).toBe(true);
  });

  test("a set shared with another player needs the full set too", () => {
    const game = deal({
      deeds: [
        [1, "a"],
        [3, "b"],
      ],
    });
    expect(actionsOf(game, 1).reason.build).toBe("Needs the full Brown set");
  });

  test("uneven building: the street with more houses is refused", () => {
    const game = deal({ deeds: skyWith([1, 0, 0]) });
    expect(actionsOf(game, 6)).toMatchObject({ canBuild: false });
    expect(actionsOf(game, 6).reason.build).toBe("Build on a street with fewer buildings first");
    expect(actionsOf(game, 8).canBuild).toBe(true);
    expect(actionsOf(game, 9).canBuild).toBe(true);
  });

  test("even building: when all are level, any street may be built on", () => {
    const game = deal({ deeds: skyWith([2, 2, 2]) });
    for (const square of SKY) expect(actionsOf(game, square).canBuild).toBe(true);
  });

  test("selling is even and in reverse", () => {
    const game = deal({ deeds: skyWith([2, 1, 1]) });
    expect(actionsOf(game, 6).canSell).toBe(true);
    expect(actionsOf(game, 8).canSell).toBe(false);
    expect(actionsOf(game, 8).reason.sell).toBe("Sell from a street with more buildings first");
  });

  test("a street with four houses takes a hotel, and a hotel takes nothing more", () => {
    const four = deal({ deeds: skyWith([4, 4, 4]) });
    expect(actionsOf(four, 6).canBuild).toBe(true);
    const hotels = deal({ deeds: skyWith([5, 5, 5]) });
    expect(actionsOf(hotels, 6).canBuild).toBe(false);
    expect(actionsOf(hotels, 6).reason.build).toBe("Already has a hotel");
    expect(actionsOf(hotels, 6).canSell).toBe(true);
  });

  test("a hotel cannot go up while a street has fewer than four houses", () => {
    const game = deal({ deeds: skyWith([4, 3, 4]) });
    expect(actionsOf(game, 6).canBuild).toBe(false);
    expect(actionsOf(game, 8).canBuild).toBe(true);
  });

  test("one mortgaged street blocks building on the whole set", () => {
    const game = deal({
      deeds: skyWith([0, 0, 0]).map(
        ([s, w, d]) => [s, w, s === 6 ? { ...d, mortgaged: true } : d] as const,
      ),
    });
    expect(actionsOf(game, 8).canBuild).toBe(false);
    expect(actionsOf(game, 8).reason.build).toBe("Lift the mortgage on the set first");
  });

  test("cash: building needs the price", () => {
    expect(actionsOf(sky({ cash: { a: 49 } }), 6)).toMatchObject({ canBuild: false });
    expect(actionsOf(sky({ cash: { a: 49 } }), 6).reason.build).toBe("Needs $50");
    expect(actionsOf(sky({ cash: { a: 50 } }), 6).canBuild).toBe(true);
  });
});

describe("propertyActions: mortgages", () => {
  test("a set with houses blocks the mortgage of every street in it", () => {
    const game = deal({ deeds: skyWith([1, 0, 0]) });
    for (const square of SKY) {
      expect(actionsOf(game, square).canMortgage).toBe(false);
      expect(actionsOf(game, square).reason.mortgage).toBe("Sell the buildings first");
    }
  });

  test("a mortgaged street can be lifted, not mortgaged again", () => {
    const game = deal({ deeds: [[6, "a", { mortgaged: true }]] });
    const a = actionsOf(game, 6);
    expect(a).toMatchObject({ canMortgage: false, canUnmortgage: true, canBuild: false });
    expect(a.reason.mortgage).toBe("Already mortgaged");
  });

  test("lifting needs the mortgage value plus 10%", () => {
    const poor = deal({ deeds: [[6, "a", { mortgaged: true }]], cash: { a: 54 } });
    expect(actionsOf(poor, 6).canUnmortgage).toBe(false);
    expect(actionsOf(poor, 6).reason.unmortgage).toBe("Needs $55");
    const enough = deal({ deeds: [[6, "a", { mortgaged: true }]], cash: { a: 55 } });
    expect(actionsOf(enough, 6).canUnmortgage).toBe(true);
  });

  test("stations and utilities: mortgage yes, buildings never", () => {
    const game = deal({
      deeds: [
        [NORTH_STATION, "a"],
        [POWER_WORKS, "a"],
      ],
    });
    const station = actionsOf(game, NORTH_STATION);
    expect(station).toMatchObject({ canBuild: false, canSell: false, canMortgage: true });
    expect(station.reason.build).toBe("Only streets take buildings");
    expect(station.cost).toEqual({ build: null, sell: null, mortgage: 100, unmortgage: 110 });
    expect(actionsOf(game, POWER_WORKS).cost.mortgage).toBe(75);
    expect(actionsOf(game, POWER_WORKS).cost.unmortgage).toBe(83);
  });
});

describe("propertyActions: who and when", () => {
  test("before the roll, after the landing and in jail are manage windows", () => {
    for (const phase of ["awaiting_roll", "awaiting_end_turn", "awaiting_jail_choice"] as const) {
      const a = actionsOf(sky({ phase }), 6);
      expect(a.manageable).toBe(true);
      expect(a.canBuild).toBe(true);
    }
  });

  test("another player on turn: everything is view-only", () => {
    const game = sky({ current: "b" });
    const a = actionsOf(game, 6);
    expect(a).toMatchObject({
      canBuild: false,
      canSell: false,
      canMortgage: false,
      canUnmortgage: false,
      manageable: false,
      notNow: "Wait for your turn",
    });
  });

  test.each([
    ["awaiting_buy_decision", "Decide on the property first"],
    ["awaiting_trade_response", "Answer the trade first"],
    ["game_over", "The game is over"],
  ] as const)("phase %s is view-only", (phase, notNow) => {
    const a = actionsOf(sky({ phase }), 6);
    expect(a.manageable).toBe(false);
    expect(a.notNow).toBe(notNow);
  });

  test("an auction: the bidder is the one who acts, and it may not manage", () => {
    const game = sky({ phase: "awaiting_bid", bidder: "b" });
    expect(actionsOf(game, 6).notNow).toBe("Wait for your turn");
    const own = deal({ deeds: skyWith([0, 0, 0]), phase: "awaiting_bid", bidder: "a" });
    expect(actionsOf(own, 6).notNow).toBe("Wait for the auction to end");
  });

  test("in debt: sell and mortgage yes, build and lift no", () => {
    const built = deal({ deeds: skyWith([1, 1, 1]), phase: "awaiting_debt", owes: { a: 500 } });
    const a = actionsOf(built, 6);
    expect(a.manageable).toBe(true);
    expect(a).toMatchObject({ canSell: true, canBuild: false, canMortgage: false });
    expect(a.reason.build).toBe("Settle the debt first");

    const bare = deal({
      deeds: [
        [6, "a"],
        [8, "a", { mortgaged: true }],
      ],
      phase: "awaiting_debt",
      owes: { a: 500 },
    });
    expect(actionsOf(bare, 6).canMortgage).toBe(true);
    expect(actionsOf(bare, 8).canUnmortgage).toBe(false);
    expect(actionsOf(bare, 8).reason.unmortgage).toBe("Settle the debt first");
  });

  test("an eliminated player cannot act", () => {
    const a = actionsOf(sky({ out: ["a"] }), 6);
    expect(a.manageable).toBe(false);
    expect(a.notNow).toBe("Out of the game");
  });

  test("a property of another player or an unowned square", () => {
    const game = deal({ deeds: [[6, "b"]] });
    expect(actionsOf(game, 6).reason.mortgage).toBe("Not your property");
    expect(actionsOf(game, 8).canMortgage).toBe(false);
  });

  test("a square that is not a property", () => {
    const a = actionsOf(deal(), 0);
    expect(a).toMatchObject({ canBuild: false, canMortgage: false, manageable: false });
    expect(a.notNow).toBe("Not a property");
    expect(a.cost).toEqual({ build: null, sell: null, mortgage: null, unmortgage: null });
  });
});

describe("propertyActions: the engine agrees (drift)", () => {
  const types: Record<string, ActionType> = {
    canBuild: "Build",
    canSell: "SellBuilding",
    canMortgage: "Mortgage",
    canUnmortgage: "Unmortgage",
  };

  function expectSameAsEngine(
    game: { full: GameState; state: ReturnType<typeof deal>["state"] },
    ids: string[],
  ) {
    for (const playerId of ids) {
      for (let square = 0; square < 40; square++) {
        const a = propertyActions(game.state, playerId, square);
        for (const [key, type] of Object.entries(types)) {
          const engine = applyAction(game.full, { type, playerId, square } as never);
          expect(a[key as keyof typeof a], `${type} ${square} ${playerId}`).toBe(engine.ok);
        }
      }
    }
  }

  const situations: DealSpec[] = [
    { deeds: skyWith([0, 0, 0]) },
    { deeds: skyWith([1, 0, 0]) },
    { deeds: skyWith([2, 1, 1]) },
    { deeds: skyWith([4, 4, 4]) },
    { deeds: skyWith([5, 5, 5]) },
    { deeds: skyWith([0, 0, 0], { mortgaged: true }) },
    {
      deeds: [
        [6, "a", { mortgaged: true }],
        [8, "a"],
        [9, "a"],
        [5, "a"],
        [12, "b"],
      ],
      cash: { a: 54 },
    },
    { deeds: skyWith([1, 1, 1]), phase: "awaiting_debt", owes: { a: 900 } },
    { deeds: skyWith([0, 0, 0]), phase: "awaiting_debt", owes: { a: 900 } },
    { deeds: skyWith([0, 0, 0]), current: "b" },
    { deeds: skyWith([0, 0, 0]), phase: "awaiting_buy_decision" },
    { deeds: skyWith([0, 0, 0]), phase: "awaiting_bid", bidder: "a" },
    { deeds: skyWith([0, 0, 0]), phase: "game_over" },
    { deeds: skyWith([0, 0, 0]), out: ["a"] },
    {
      deeds: [
        [1, "a"],
        [3, "a"],
        [37, "a"],
        [39, "b"],
        [5, "a", { mortgaged: true }],
      ],
      cash: { a: 10 },
    },
  ];

  test.each(situations.map((spec, i) => [i, spec] as const))(
    "hand-made situation %i, redacted state",
    (_, spec) => {
      expect.hasAssertions();
      const game = deal(spec);
      expectSameAsEngine(game, [game.id("a"), game.id("b"), game.id("c")]);
    },
  );

  test("a recorded game, step by step", () => {
    expect.hasAssertions();
    const fx = recordFixture(40);
    const ids = fx.start.players.map((p) => p.id);
    for (const step of fx.steps) expectSameAsEngine(step, ids);
  });

  test("the four actions are the engine action names", () => {
    expect(MANAGE_ACTIONS).toEqual(["Build", "SellBuilding", "Mortgage", "Unmortgage"]);
  });
});
