import { redactedGameStateSchema } from "@monopoly/shared";
import { describe, expect, test } from "vite-plus/test";
import { redactState } from "./redact.ts";
import { newGame, playGame } from "./test-helpers.ts";

const SEEDS = [1, 2, 3, 4, 5];

function keysOf(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((item) => keysOf(item, found));
  else if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      found.push(key);
      keysOf(item, found);
    }
  }
  return found;
}

describe("redactState", () => {
  test("a new game has the shared redacted shape", () => {
    const state = newGame(1);
    const redacted = redactState(state);
    expect(redactedGameStateSchema.parse(redacted)).toEqual(redacted);
    expect(Object.keys(redacted).sort()).toEqual(
      ["auction", "debts", "ownership", "players", "trade", "turn", "version"].sort(),
    );
  });

  test("every state of seeded games parses and leaks no rng or deck order", () => {
    let cardDraws = 0;
    for (const seed of SEEDS) {
      const { initial, steps } = playGame(seed, 600);
      for (const state of [initial, ...steps.map((s) => s.state)]) {
        const redacted = redactState(state);
        expect(redactedGameStateSchema.parse(redacted)).toEqual(redacted);
        const json = JSON.stringify(redacted);
        const keys = keysOf(redacted);
        expect(keys).not.toContain("rng");
        expect(keys).not.toContain("decks");
        expect(keys).not.toContain("seed");
        expect(keys).not.toContain("chance");
        expect(keys).not.toContain("chest");
        expect(json).not.toContain(JSON.stringify(state.decks.chance));
        expect(json).not.toContain(JSON.stringify(state.decks.chest));
        expect(json).not.toContain(String(state.rng.seed));
      }
      cardDraws += steps.flatMap((s) => s.events).filter((e) => e.type === "CardDrawn").length;
    }
    // The scan must cover states after card draws.
    expect(cardDraws).toBeGreaterThan(0);
  });

  test("the state of a played game is redacted to exactly the engine fields", () => {
    const { steps } = playGame(2, 300);
    const state = steps[steps.length - 1]?.state;
    if (!state) throw new Error("no steps");
    const { rng: _rng, decks: _decks, ...rest } = state;
    expect(redactState(state)).toEqual(rest);
  });

  test("does not change its input", () => {
    const { steps } = playGame(3, 300);
    const state = steps[steps.length - 1]?.state;
    if (!state) throw new Error("no steps");
    const before = structuredClone(state);
    redactState(state);
    expect(state).toEqual(before);
  });

  test("shares no mutable reference with the input", () => {
    const { steps } = playGame(2, 400);
    const state = steps[steps.length - 1]?.state;
    if (!state) throw new Error("no steps");
    expect(Object.keys(state.ownership).length).toBeGreaterThan(0);
    const before = structuredClone(state);
    const redacted = redactState(state);
    expect(redacted.players).not.toBe(state.players);
    expect(redacted.players[0]).not.toBe(state.players[0]);
    expect(redacted.ownership).not.toBe(state.ownership);
    expect(redacted.turn).not.toBe(state.turn);
    for (const [square, deed] of Object.entries(redacted.ownership)) {
      expect(deed).not.toBe(state.ownership[square]);
    }

    redacted.players[0]!.cash = -1;
    redacted.players[0]!.heldJailCards.push("chance");
    redacted.turn.phase = "game_over";
    for (const deed of Object.values(redacted.ownership)) deed.houses = 5;
    expect(state).toEqual(before);
  });
});
