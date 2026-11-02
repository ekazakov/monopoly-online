import type { RedactedGameState } from "@monopoly/shared";
import { describe, expect, test } from "vite-plus/test";
import { PLAYER_LOOKS, UNKNOWN_OWNER_COLOR } from "./colors.ts";
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
    expect(buildSceneModel(null, [{ id: "a", name: "A", colorIndex: 1 }])).toEqual({
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

  test("takes the colour from `players`, else from the place in the state", () => {
    const model = buildSceneModel(state([player("a", 0), player("b", 1), player("c", 2)]), [
      { id: "b", name: "Bea", colorIndex: 3 },
    ]);
    expect(model.tokens.map((t) => t.colorIndex)).toEqual([0, 3, 2]);
    expect(model.tokens[1]).toMatchObject({ avatar: PLAYER_LOOKS[3]!.avatar, name: "Bea" });
    expect(model.tokens[0]!.name).toBe("A");
  });

  test("colours a deed with its owner's colour", () => {
    const model = buildSceneModel(
      state([player("a", 0), player("b", 1)], {
        "9": { ownerId: "b", houses: 2, mortgaged: false },
        "1": { ownerId: "a", houses: 0, mortgaged: true },
      }),
      [{ id: "b", name: "B", colorIndex: 2 }],
    );
    expect(model.deeds).toEqual([
      { square: 1, ownerId: "a", ownerColor: PLAYER_LOOKS[0]!.color, houses: 0, mortgaged: true },
      { square: 9, ownerId: "b", ownerColor: PLAYER_LOOKS[2]!.color, houses: 2, mortgaged: false },
    ]);
  });

  test("keeps the deed of an owner that is not in the game, in a neutral colour", () => {
    const model = buildSceneModel(
      state([player("a", 0)], { "3": { ownerId: "ghost", houses: 0, mortgaged: false } }),
    );
    expect(model.deeds[0]!.ownerColor).toBe(UNKNOWN_OWNER_COLOR);
  });
});
