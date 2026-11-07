import { describe, expect, test } from "vite-plus/test";
import { CHANCE_CARDS, CHEST_CARDS } from "../../../packages/game-engine/src/index.ts";
import { E2E_SEED } from "../support/seed.ts";
import { checkedAction, replaySeed, seedGame } from "../support/seed-replay.ts";

describe("browser scenario seed contract", () => {
  test("three-seat order, dice and landings match the UI scenarios", () => {
    const replay = replaySeed(E2E_SEED, 3, 7);
    expect(replay.turnOrder).toEqual(["Bob", "Cara", "Alice"]);
    expect(replay.rolls.map(({ player, dice, square }) => ({ player, dice, square }))).toEqual([
      { player: "Bob", dice: [5, 6], square: 11 },
      { player: "Cara", dice: [4, 6], square: 10 },
      { player: "Alice", dice: [5, 1], square: 6 },
      { player: "Bob", dice: [2, 3], square: 16 },
      { player: "Cara", dice: [3, 1], square: 14 },
      { player: "Alice", dice: [1, 5], square: 12 },
      { player: "Bob", dice: [3, 3], square: 22 },
    ]);
    expect(replay.state.turn).toMatchObject({
      currentPlayerId: "Bob",
      phase: "awaiting_roll",
      doubles: 1,
    });
  });

  test("two-seat rolls still reach the bankruptcy and auction fixtures", () => {
    const replay = replaySeed(E2E_SEED, 2, 4);
    expect(replay.turnOrder).toEqual(["Bob", "Alice"]);
    expect(replay.rolls.map(({ player, dice, square }) => ({ player, dice, square }))).toEqual([
      { player: "Bob", dice: [4, 5], square: 9 },
      { player: "Alice", dice: [6, 4], square: 10 },
      { player: "Bob", dice: [6, 5], square: 20 },
      { player: "Alice", dice: [1, 2], square: 13 },
    ]);
  });

  test.each([
    { square: 11, deck: "chance", title: "Loan matures", cash: 1650 },
    { square: 6, deck: "chest", title: "Tax refund", cash: 1520 },
  ] as const)(
    "the first $deck card keeps its title and cash effect",
    ({ square, deck, title, cash }) => {
      const initial = seedGame(E2E_SEED, 3);
      const edited = checkedAction(initial, {
        type: "DebugEdit",
        playerId: "Bob",
        changes: [{ kind: "position", targetId: "Bob", square }],
      });
      const rolled = checkedAction(edited.state, { type: "RollDice", playerId: "Bob" });
      const card = rolled.events.find((event) => event.type === "CardDrawn");
      expect(card).toMatchObject({ type: "CardDrawn", deck, playerId: "Bob" });
      if (card?.type !== "CardDrawn") throw new Error("No card was drawn");
      expect((deck === "chance" ? CHANCE_CARDS : CHEST_CARDS)[card.cardIndex]?.title).toBe(title);
      expect(rolled.state.players.find((player) => player.id === "Bob")?.cash).toBe(cash);
    },
  );
});
