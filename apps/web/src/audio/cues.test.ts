import { describe, expect, test } from "vite-plus/test";
import type { GameEvent } from "@monopoly/shared";
import { OTHER_GAIN, cuesFor, moneyCues } from "./cues.ts";

const me = new Set(["p1"]);
const names = (events: GameEvent[], seats: ReadonlySet<string> = me) =>
  cuesFor(events, seats).map((cue) => cue.name);

describe("cuesFor", () => {
  test("the cues of other players are quieter", () => {
    const [cue] = cuesFor([{ type: "PropertyBought", playerId: "p2", square: 1, price: 60 }], me);
    expect(cue).toEqual({ name: "stamp", gain: OTHER_GAIN });
  });

  test("the bell rings only when the next turn is a seat of this device", () => {
    expect(names([{ type: "TurnEnded", playerId: "p2", nextPlayerId: "p1" }])).toEqual(["bell"]);
    expect(names([{ type: "TurnEnded", playerId: "p1", nextPlayerId: "p2" }])).toEqual([]);
    // on a shared device every local seat counts
    expect(
      names([{ type: "TurnEnded", playerId: "p1", nextPlayerId: "p2" }], new Set(["p1", "p2"])),
    ).toEqual(["bell"]);
  });

  test("the end of the game plays the win cue for the winner and no bell", () => {
    const events: GameEvent[] = [
      { type: "BankruptcyDeclared", playerId: "p2", creditorIds: ["p1"] },
      { type: "PlayerEliminated", playerId: "p2" },
      { type: "TurnEnded", playerId: "p2", nextPlayerId: "p1" },
      { type: "GameEnded", winnerId: "p1" },
    ];
    expect(names(events)).toEqual(["bankrupt", "win"]);
    expect(names(events, new Set(["p2"]))).toEqual(["bankrupt", "end"]);
  });

  test("a cue that comes two times in a row plays one time, and skipped events play none", () => {
    const events: GameEvent[] = [
      { type: "CardDrawn", playerId: "p1", deck: "chance", cardIndex: 0 },
      { type: "BuildingBuilt", playerId: "p1", square: 1, houses: 1, cost: 50 },
      { type: "BuildingBuilt", playerId: "p1", square: 3, houses: 1, cost: 50 },
    ];
    expect(names(events)).toEqual(["card", "build"]);
    expect(cuesFor(events, me, { skip: new Set([0]) }).map((cue) => cue.name)).toEqual(["build"]);
  });

  test("events with no sound give no cue, and money events leave money to moneyCues", () => {
    expect(names([{ type: "LeftJail", playerId: "p1" }])).toEqual([]);
    expect(names([{ type: "PassedGo", playerId: "p1", amount: 200 }])).toEqual([]);
  });
});

describe("moneyCues", () => {
  const cash = (entries: Record<string, number>) => new Map(Object.entries(entries));

  test("a balance that goes up rings the coins, and one that goes down plays the sad cue", () => {
    expect(moneyCues(cash({ p1: 1500 }), cash({ p1: 1700 }), me)).toEqual([
      { name: "coin-in", gain: 1 },
    ]);
    expect(moneyCues(cash({ p1: 1500 }), cash({ p1: 1350 }), me)).toEqual([
      { name: "coin-out", gain: 1 },
    ]);
  });

  test("rent between two players plays both cues one time, as loud as the loudest player", () => {
    const before = cash({ p1: 1500, p2: 1500, p3: 1500 });
    expect(moneyCues(before, cash({ p1: 1450, p2: 1550, p3: 1500 }), me)).toEqual([
      { name: "coin-in", gain: OTHER_GAIN },
      { name: "coin-out", gain: 1 },
    ]);
    // a player pays the bank and two others: still one sad cue
    expect(moneyCues(before, cash({ p1: 1500, p2: 1400, p3: 1400 }), me)).toEqual([
      { name: "coin-out", gain: OTHER_GAIN },
    ]);
  });

  test("no change and players with no known balance give no cue", () => {
    expect(moneyCues(cash({ p1: 1500 }), cash({ p1: 1500 }), me)).toEqual([]);
    expect(moneyCues(cash({}), cash({ p1: 1500 }), me)).toEqual([]);
  });
});
