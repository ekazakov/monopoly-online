import type { RedactedGameState } from "@monopoly/shared";
import { describe, expect, test } from "vite-plus/test";
import { UNKNOWN_OWNER_COLOR, tokenLook } from "./colors.ts";
import { buildSceneModel } from "./model.ts";

const player = (
  id: string,
  position: number,
  extra: Partial<RedactedGameState["players"][number]> = {},
) => ({
  id,
  name: id.toUpperCase(),
  cash: 1500,
  position,
  inJail: false,
  jailTurns: 0,
  heldJailCards: [],
  active: true,
  ...extra,
});

const state = (
  players: RedactedGameState["players"],
  ownership: RedactedGameState["ownership"] = {},
): RedactedGameState => ({
  version: 1,
  players,
  ownership,
  turn: { currentPlayerId: players[0]!.id, phase: "awaiting_roll", doubles: 0, dice: null },
  debts: [],
  auction: null,
  trade: null,
});

describe("buildSceneModel", () => {
  test("draws nothing without a state", () => {
    expect(buildSceneModel(null)).toEqual({ tokens: [], deeds: [] });
    expect(buildSceneModel(null, [{ id: "a", name: "A", token: "cat" }])).toEqual({
      tokens: [],
      deeds: [],
    });
  });

  test("makes one token per active player, on the player's square", () => {
    const model = buildSceneModel(
      state([player("a", 0), player("b", 21, { inJail: true }), player("c", 5, { active: false })]),
    );
    expect(model.tokens.map((t) => [t.id, t.square, t.inJail])).toEqual([
      ["a", 0, false],
      ["b", 21, true],
    ]);
  });

  test("takes the token from `players`, else from the place in the state", () => {
    const model = buildSceneModel(state([player("a", 0), player("b", 1), player("c", 2)]), [
      { id: "b", name: "Bea", token: "car" },
    ]);
    expect(model.tokens.map((t) => t.token)).toEqual(["dog", "car", "penguin"]);
    expect(model.tokens[1]).toMatchObject({
      avatar: "car",
      metal: tokenLook("car").metal,
      name: "Bea",
    });
    expect(model.tokens[0]!.name).toBe("A");
  });

  test("the token decides the figure, not the seat order: a duck and a horse", () => {
    const model = buildSceneModel(state([player("a", 0), player("b", 1)]), [
      { id: "a", name: "A", token: "duck" },
      { id: "b", name: "B", token: "horse" },
    ]);
    expect(model.tokens.map((t) => [t.avatar, t.metal])).toEqual([
      ["duck", tokenLook("duck").metal],
      ["horse", tokenLook("horse").metal],
    ]);
  });

  test("colours a deed with its owner's colour", () => {
    const model = buildSceneModel(
      state([player("a", 0), player("b", 1)], {
        "9": { ownerId: "b", houses: 2, mortgaged: false },
        "1": { ownerId: "a", houses: 0, mortgaged: true },
      }),
      [{ id: "b", name: "B", token: "penguin" }],
    );
    expect(model.deeds).toEqual([
      {
        square: 1,
        ownerId: "a",
        ownerToken: "dog",
        ownerColor: tokenLook("dog").hex,
        houses: 0,
        mortgaged: true,
      },
      {
        square: 9,
        ownerId: "b",
        ownerToken: "penguin",
        ownerColor: tokenLook("penguin").hex,
        houses: 2,
        mortgaged: false,
      },
    ]);
  });

  test("keeps the deed of an owner that is not in the game, in a neutral colour", () => {
    const model = buildSceneModel(
      state([player("a", 0)], { "3": { ownerId: "ghost", houses: 0, mortgaged: false } }),
    );
    expect(model.deeds[0]!.ownerColor).toBe(UNKNOWN_OWNER_COLOR);
    expect(model.deeds[0]!.ownerToken).toBeUndefined();
  });
});
