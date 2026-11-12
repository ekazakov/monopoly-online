import { describe, expect, test } from "vite-plus/test";
import type { GameEvent, GameEventType } from "@monopoly/shared";
import { recordFixture } from "../../../game/fixtures.ts";
import { tEn } from "../../../testing/tEn.ts";
import { describeEvent, formatMoney, playerName } from "./describe.ts";
import type { LogTone } from "./describe.ts";

const fx = recordFixture(90);
const [a, b, c] = [fx.seats.a, fx.seats.b, fx.seats.c];
const ctx = { seats: fx.game.seats };

type Expected = [event: GameEvent, text: string, tone: LogTone];

// One entry per event type. `Record<GameEventType, ...>` fails the type check when a type is added.
const TABLE: Record<GameEventType, Expected> = {
  DiceRolled: [
    { type: "DiceRolled", playerId: a.id, dice: [4, 3] },
    "Ann rolled 4 and 3.",
    "neutral",
  ],
  PlayerMoved: [
    { type: "PlayerMoved", playerId: a.id, from: 4, to: 21 },
    "Ann moved to Beacon Hill.",
    "neutral",
  ],
  PassedGo: [
    { type: "PassedGo", playerId: b.id, amount: 200 },
    "Bo collected $200 passing Start.",
    "gain",
  ],
  PropertyBought: [
    { type: "PropertyBought", playerId: a.id, square: 21, price: 220 },
    "Ann bought Beacon Hill for $220.",
    "neutral",
  ],
  RentPaid: [
    { type: "RentPaid", payerId: c.id, ownerId: a.id, square: 21, amount: 1200 },
    "Cy paid $1,200 rent to Ann.",
    "loss",
  ],
  TaxPaid: [
    { type: "TaxPaid", playerId: b.id, square: 4, amount: 200 },
    "Bo paid $200 Income Tax.",
    "loss",
  ],
  CardDrawn: [
    { type: "CardDrawn", playerId: a.id, deck: "chance", cardIndex: 8 },
    "Ann drew a Chance card: Dividend.",
    "neutral",
  ],
  CashChanged: [
    { type: "CashChanged", playerId: a.id, amount: 50, reason: "card" },
    "Ann collected $50.",
    "gain",
  ],
  BuildingBuilt: [
    { type: "BuildingBuilt", playerId: a.id, square: 1, houses: 2, cost: 50 },
    "Ann built a house on Driftwood Lane for $50.",
    "neutral",
  ],
  BuildingSold: [
    { type: "BuildingSold", playerId: a.id, square: 1, houses: 1, refund: 25 },
    "Ann sold a house on Driftwood Lane for $25.",
    "gain",
  ],
  PropertyMortgaged: [
    { type: "PropertyMortgaged", playerId: b.id, square: 39, amount: 200 },
    "Bo mortgaged Grand Pier for $200.",
    "gain",
  ],
  PropertyUnmortgaged: [
    { type: "PropertyUnmortgaged", playerId: b.id, square: 39, cost: 220 },
    "Bo unmortgaged Grand Pier for $220.",
    "loss",
  ],
  DebtIncurred: [
    {
      type: "DebtIncurred",
      debtorId: c.id,
      creditor: { type: "player", id: a.id },
      amount: 120,
      reason: "rent",
    },
    "Cy owes Ann $120 for rent.",
    "alert",
  ],
  DebtPaid: [
    { type: "DebtPaid", debtorId: c.id, creditor: { type: "bank" }, amount: 200 },
    "Cy paid a $200 debt to the bank.",
    "loss",
  ],
  BankruptcyDeclared: [
    { type: "BankruptcyDeclared", playerId: c.id, creditorIds: [a.id, b.id] },
    "Cy went bankrupt to Ann and Bo.",
    "alert",
  ],
  AssetsTransferred: [
    {
      type: "AssetsTransferred",
      fromId: c.id,
      toId: a.id,
      squares: [1, 3],
      jailCards: ["chance"],
      cash: [{ playerId: a.id, amount: 80 }],
    },
    "Cy's assets went to Ann: 2 properties, 1 Get Out of Jail Free card, $80.",
    "alert",
  ],
  PlayerResigned: [{ type: "PlayerResigned", playerId: b.id }, "Bo resigned.", "alert"],
  PlayerEliminated: [
    { type: "PlayerEliminated", playerId: b.id },
    "Bo is out of the game.",
    "alert",
  ],
  AuctionStarted: [
    { type: "AuctionStarted", square: 6, bidderIds: [a.id, b.id, c.id] },
    "Auction for Lantern Row started. Bidders: Ann, Bo and Cy.",
    "neutral",
  ],
  BidPlaced: [{ type: "BidPlaced", playerId: b.id, amount: 110 }, "Bo bid $110.", "neutral"],
  BidPassed: [{ type: "BidPassed", playerId: c.id, auto: false }, "Cy passed.", "neutral"],
  AuctionEnded: [
    { type: "AuctionEnded", square: 6, winnerId: b.id, price: 110 },
    "Bo won Lantern Row at auction for $110.",
    "neutral",
  ],
  TradeProposed: [
    {
      type: "TradeProposed",
      fromId: a.id,
      toId: b.id,
      give: { cash: 50, squares: [21], jailCards: [] },
      get: { cash: 0, squares: [39], jailCards: ["chest"] },
    },
    "Ann proposed a trade to Bo: gives Beacon Hill + $50, gets Grand Pier + Get Out of Jail Free (Chest).",
    "neutral",
  ],
  TradeAccepted: [
    { type: "TradeAccepted", fromId: a.id, toId: b.id },
    "Bo accepted the trade from Ann.",
    "gain",
  ],
  TradeRejected: [
    { type: "TradeRejected", fromId: a.id, toId: b.id },
    "Bo rejected the trade from Ann.",
    "neutral",
  ],
  TradeCancelled: [
    { type: "TradeCancelled", fromId: a.id, toId: b.id },
    "Ann cancelled the trade offer to Bo.",
    "neutral",
  ],
  FinePaid: [
    { type: "FinePaid", playerId: c.id, amount: 50 },
    "Cy paid the $50 jail fine.",
    "loss",
  ],
  SentToJail: [{ type: "SentToJail", playerId: c.id }, "Cy was sent to jail.", "alert"],
  LeftJail: [{ type: "LeftJail", playerId: c.id }, "Cy left jail.", "gain"],
  TurnEnded: [
    { type: "TurnEnded", playerId: a.id, nextPlayerId: b.id },
    "Ann ended the turn. Bo is next.",
    "neutral",
  ],
  GameEnded: [{ type: "GameEnded", winnerId: b.id }, "Bo won the game!", "gain"],
  StateEdited: [
    { type: "StateEdited", playerId: a.id, change: { kind: "cash", targetId: b.id, cash: 1500 } },
    "Ann (debug): Bo's cash set to $1,500.",
    "alert",
  ],
};

describe("describeEvent", () => {
  test("the table has 32 event types", () => {
    expect(Object.keys(TABLE)).toHaveLength(32);
  });

  test.each(Object.entries(TABLE))("%s", (type, [event, text, tone]) => {
    expect(event.type).toBe(type);
    const line = describeEvent(event, ctx, tEn);
    expect(line.text).toBe(text);
    expect(line.tone).toBe(tone);
    const joined = line.parts.map((part) =>
      typeof part === "string" ? part : playerName(ctx, part.playerId, tEn),
    );
    expect(joined.join("")).toBe(text);
  });

  test("the parts hold the players in the order of the text", () => {
    const line = describeEvent(TABLE.RentPaid[0], ctx, tEn);
    expect(line.parts.filter((part) => typeof part !== "string")).toEqual([
      { playerId: c.id },
      { playerId: a.id },
    ]);
    expect(line.playerId).toBe(c.id);
  });

  test("doubles, hotels and automatic passes get their own words", () => {
    const text = (event: GameEvent) => describeEvent(event, ctx, tEn).text;
    expect(text({ type: "DiceRolled", playerId: a.id, dice: [3, 3] })).toBe(
      "Ann rolled 3 and 3 (doubles).",
    );
    expect(text({ type: "BuildingBuilt", playerId: a.id, square: 1, houses: 5, cost: 50 })).toBe(
      "Ann built a hotel on Driftwood Lane for $50.",
    );
    expect(text({ type: "BuildingSold", playerId: a.id, square: 1, houses: 4, refund: 25 })).toBe(
      "Ann sold a hotel on Driftwood Lane for $25.",
    );
    expect(text({ type: "BidPassed", playerId: b.id, auto: true })).toBe(
      "Bo passed automatically.",
    );
    expect(text({ type: "CashChanged", playerId: b.id, amount: -15, reason: "card" })).toBe(
      "Bo paid $15.",
    );
    expect(text({ type: "AuctionEnded", square: 6, winnerId: null, price: 0 })).toBe(
      "No one bid on Lantern Row. It stays unowned.",
    );
    expect(text({ type: "BankruptcyDeclared", playerId: c.id, creditorIds: [] })).toBe(
      "Cy went bankrupt to the bank.",
    );
    expect(
      text({
        type: "AssetsTransferred",
        fromId: c.id,
        toId: null,
        squares: [1],
        jailCards: [],
        cash: [],
      }),
    ).toBe("Cy's assets went to the bank: 1 property.");
    expect(
      text({
        type: "AssetsTransferred",
        fromId: c.id,
        toId: null,
        squares: [],
        jailCards: [],
        cash: [],
      }),
    ).toBe("Cy's assets went to the bank: nothing.");
    expect(
      text({
        type: "DebtIncurred",
        debtorId: a.id,
        creditor: { type: "bank" },
        amount: 200,
        reason: "tax",
      }),
    ).toBe("Ann owes the bank $200 for tax.");
    expect(
      text({
        type: "TradeProposed",
        fromId: a.id,
        toId: b.id,
        give: { cash: 0, squares: [], jailCards: [] },
        get: { cash: 10, squares: [], jailCards: [] },
      }),
    ).toBe("Ann proposed a trade to Bo: gives nothing, gets $10.");
  });

  test("debug edits of deeds and tokens", () => {
    const text = (change: Extract<GameEvent, { type: "StateEdited" }>["change"]) =>
      describeEvent({ type: "StateEdited", playerId: a.id, change }, ctx, tEn).text;
    expect(text({ kind: "deed", square: 1, ownerId: b.id, houses: 2, mortgaged: false })).toBe(
      "Ann (debug): Driftwood Lane given to Bo, 2 houses.",
    );
    expect(text({ kind: "deed", square: 39, ownerId: c.id, houses: 5, mortgaged: false })).toMatch(
      /given to Cy, a hotel\.$/,
    );
    expect(text({ kind: "deed", square: 5, ownerId: c.id, houses: 0, mortgaged: true })).toMatch(
      /given to Cy, mortgaged\.$/,
    );
    expect(text({ kind: "deed", square: 1, ownerId: null, houses: 0, mortgaged: false })).toBe(
      "Ann (debug): Driftwood Lane returned to the bank.",
    );
    expect(text({ kind: "position", targetId: c.id, square: 10 })).toMatch(
      /^Ann \(debug\): Cy's token put on .+\.$/,
    );
    expect(text({ kind: "top_card", deck: "chest", cardIndex: 1 })).toBe(
      'Ann (debug): "Bank error" put on top of Chest.',
    );
    expect(text({ kind: "next_dice", dice: [3, 4] })).toBe(
      "Ann (debug): next roll set to 3 and 4.",
    );
  });

  test("card texts come from the decks", () => {
    expect(
      describeEvent({ type: "CardDrawn", playerId: a.id, deck: "chest", cardIndex: 1 }, ctx, tEn)
        .text,
    ).toBe("Ann drew a Chest card: Bank error.");
    expect(
      describeEvent({ type: "CardDrawn", playerId: a.id, deck: "chest", cardIndex: 99 }, ctx, tEn)
        .text,
    ).toBe("Ann drew a Chest card: a card.");
  });

  test("an unknown player reads as a player", () => {
    expect(describeEvent({ type: "SentToJail", playerId: "nobody" }, ctx, tEn).text).toBe(
      "A player was sent to jail.",
    );
  });

  test("an icon is set for every line that is not plain talk", () => {
    expect(describeEvent(TABLE.PassedGo[0], ctx, tEn).icon).toBe("coin");
    expect(describeEvent(TABLE.SentToJail[0], ctx, tEn).icon).toBe("jail");
  });

  test("every event of a seeded game reads as a clean line", () => {
    const seen = new Set<string>();
    for (const step of fx.steps) {
      for (const event of step.events) {
        seen.add(event.type);
        const line = describeEvent(event, ctx, tEn);
        expect(line.text).toMatch(/^\S.*[.!]$/);
        expect(line.text).not.toMatch(/undefined|NaN|\[object|A player|square \d/);
      }
    }
    // The seeded game covers the main flows; the table above covers the rest.
    for (const type of [
      "DiceRolled",
      "PlayerMoved",
      "PropertyBought",
      "TurnEnded",
      "AuctionStarted",
    ]) {
      expect(seen).toContain(type);
    }
    for (const type of seen) expect(Object.keys(TABLE)).toContain(type);
  });
});

describe("formatMoney", () => {
  test.each([
    [0, "$0"],
    [200, "$200"],
    [1500, "$1,500"],
    [-20, "−$20"],
  ])("%d reads %s", (amount, text) => {
    expect(formatMoney(amount)).toBe(text);
  });
});
