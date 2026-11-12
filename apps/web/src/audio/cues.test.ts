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

describe("coin cues", () => {
  const cash = (entries: Record<string, number>) => new Map(Object.entries(entries));

  test("the coins ring for a balance that goes up, as loud as the loudest player", () => {
    expect(moneyCues(cash({ p1: 1500 }), cash({ p1: 1700 }), me)).toEqual([
      { name: "coin-in", gain: 1 },
    ]);
    const before = cash({ p1: 1500, p2: 1500, p3: 1500 });
    expect(moneyCues(before, cash({ p1: 1450, p2: 1550, p3: 1500 }), me)).toEqual([
      { name: "coin-in", gain: OTHER_GAIN },
    ]);
    expect(moneyCues(before, cash({ p1: 1550, p2: 1550, p3: 1400 }), me)).toEqual([
      { name: "coin-in", gain: 1 },
    ]);
  });

  test("a balance that goes down, no change and an unknown balance give no coin ring", () => {
    expect(moneyCues(cash({ p1: 1500 }), cash({ p1: 1350 }), me)).toEqual([]);
    expect(moneyCues(cash({ p1: 1500 }), cash({ p1: 1500 }), me)).toEqual([]);
    expect(moneyCues(cash({}), cash({ p1: 1500 }), me)).toEqual([]);
  });

  test("the sad cue is only for a tax and for a card that takes money", () => {
    expect(names([{ type: "TaxPaid", playerId: "p1", square: 4, amount: 200 }])).toEqual([
      "coin-out",
    ]);
    expect(names([{ type: "CashChanged", playerId: "p1", amount: -50, reason: "card" }])).toEqual([
      "coin-out",
    ]);
    // a card that gives money, rent, a fine, a purchase and a debt payment have no sad cue
    expect(names([{ type: "CashChanged", playerId: "p1", amount: 50, reason: "card" }])).toEqual(
      [],
    );
    expect(
      names([
        { type: "RentPaid", payerId: "p1", ownerId: "p2", square: 1, amount: 4 },
        { type: "FinePaid", playerId: "p1", amount: 50 },
        { type: "PropertyBought", playerId: "p1", square: 1, price: 60 },
        { type: "DebtPaid", debtorId: "p1", creditor: { type: "bank" }, amount: 20 },
      ]),
    ).toEqual(["stamp"]);
  });

  test("one action plays one sad cue, as loud as the loudest player it is for", () => {
    const events: GameEvent[] = [
      { type: "CashChanged", playerId: "p2", amount: -50, reason: "card" },
      { type: "CashChanged", playerId: "p3", amount: 50, reason: "card" },
      { type: "CashChanged", playerId: "p1", amount: -50, reason: "card" },
    ];
    expect(cuesFor(events, me)).toEqual([{ name: "coin-out", gain: 1 }]);
    expect(cuesFor(events.slice(0, 1), me)).toEqual([{ name: "coin-out", gain: OTHER_GAIN }]);
  });
});
