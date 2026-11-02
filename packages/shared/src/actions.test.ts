import { describe, expect, test } from "vite-plus/test";
import { actionInputSchema } from "./index.ts";

const offer = { cash: 100, squares: [1, 3], jailCards: ["chance"] };

describe("actionInputSchema", () => {
  test("parses every kind of action", () => {
    const actions = [
      { type: "RollDice" },
      { type: "BuyProperty" },
      { type: "DeclineProperty" },
      { type: "PayJailFine" },
      { type: "UseJailCard" },
      { type: "Build", square: 1 },
      { type: "SellBuilding", square: 3 },
      { type: "Mortgage", square: 5 },
      { type: "Unmortgage", square: 5 },
      { type: "PayDebt" },
      { type: "Bid", amount: 0 },
      { type: "PassBid" },
      { type: "ProposeTrade", toPlayerId: "p2", give: offer, get: { ...offer, cash: 0 } },
      { type: "AcceptTrade" },
      { type: "RejectTrade" },
      { type: "CancelTrade" },
      { type: "EndTurn" },
      { type: "Resign" },
    ];
    expect(actionInputSchema.options).toHaveLength(actions.length);
    for (const action of actions) expect(actionInputSchema.parse(action)).toEqual(action);
  });

  test("refuses playerId on every action", () => {
    expect(actionInputSchema.safeParse({ type: "RollDice", playerId: "a" }).success).toBe(false);
    expect(actionInputSchema.safeParse({ type: "Bid", amount: 10, playerId: "a" }).success).toBe(
      false,
    );
  });

  test("checks the fields", () => {
    const bad = (action: unknown) => actionInputSchema.safeParse(action).success;
    expect(bad({ type: "Build" })).toBe(false);
    expect(bad({ type: "Build", square: -1 })).toBe(false);
    expect(bad({ type: "Build", square: 40 })).toBe(false);
    expect(bad({ type: "Build", square: 1.5 })).toBe(false);
    expect(bad({ type: "Bid", amount: -1 })).toBe(false);
    expect(bad({ type: "Bid", amount: 10.5 })).toBe(false);
    expect(bad({ type: "ProposeTrade", toPlayerId: "p2", give: offer })).toBe(false);
    expect(
      bad({
        type: "ProposeTrade",
        toPlayerId: "p2",
        give: { ...offer, jailCards: ["x"] },
        get: offer,
      }),
    ).toBe(false);
    expect(bad({ type: "RollDice", extra: 1 })).toBe(false);
    expect(bad({})).toBe(false);
  });
});
