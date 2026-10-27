import { describe, expect, test } from "vite-plus/test";
import { applyAction, createGame } from "./index.ts";
import type { GameState } from "./index.ts";

const game = (): GameState =>
  createGame({
    seed: 1,
    players: [
      { id: "a", name: "Ann" },
      { id: "b", name: "Bo" },
      { id: "c", name: "Cy" },
    ],
  });

/** Turn state where `current` can end the turn, and only `alive` players are active. */
function ending(alive: string[]): GameState {
  const state = game();
  const current = alive[0] ?? "";
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, active: alive.includes(p.id) })),
    turn: { currentPlayerId: current, phase: "awaiting_end_turn", doubles: 0, dice: [1, 2] },
  };
}

describe("game end", () => {
  test("ends when one active player is left, and that player wins", () => {
    const result = applyAction(ending(["b"]), { type: "EndTurn", playerId: "b" });
    expect(result.ok && result.state.turn.phase).toBe("game_over");
    expect(result.ok && result.events.at(-1)).toEqual({ type: "GameEnded", winnerId: "b" });
    expect(result.ok && result.state.version).toBe(1);
  });

  test("does not end while two or more players are active", () => {
    const result = applyAction(ending(["a", "c"]), { type: "EndTurn", playerId: "a" });
    expect(result.ok && result.state.turn.phase).toBe("awaiting_roll");
    expect(result.ok && result.events.some((e) => e.type === "GameEnded")).toBe(false);
  });

  test("rejects every action after the game is over", () => {
    const over = applyAction(ending(["b"]), { type: "EndTurn", playerId: "b" });
    if (!over.ok) throw new Error(over.error.message);
    const result = applyAction(over.state, { type: "RollDice", playerId: "b" });
    expect(result).toMatchObject({ ok: false, error: { code: "wrong_phase" } });
  });
});
