import { describe, expect, test } from "vite-plus/test";
import { HOP_MS, JUMP_MS } from "./motion.ts";
import { arrivedSquare, tokenFacing } from "./tokenFacing.ts";
import type { AvatarKind } from "./sculpt.ts";

// Front vectors taken from the head/nose positions in the sculpt models.
const fronts: [AvatarKind, number, number][] = [
  ["cat", -1, 0],
  ["dog", -1, 0],
  ["horse", -1, 0],
  ["duck", -1, 0],
  ["car", 1, 0],
  ["penguin", 0, 1],
];

describe("pawn facing", () => {
  for (const [kind, x, z] of fronts) {
    test(`${kind} faces NE on the left/top and SW on the right/bottom`, () => {
      for (let square = 0; square < 40; square++) {
        const yaw = tokenFacing(kind, square);
        const direction = square >= 10 && square < 30 ? 1 : -1;
        expect(x * Math.cos(yaw) + z * Math.sin(yaw)).toBeCloseTo(direction / Math.sqrt(2));
        expect(-x * Math.sin(yaw) + z * Math.cos(yaw)).toBeCloseTo(-direction / Math.sqrt(2));
      }
    });
  }

  for (const corner of [0, 10, 20, 30]) {
    test(`turns on landing at corner ${corner}, including the final hop`, () => {
      const from = (corner + 39) % 40;
      const step = {
        kind: "walk",
        playerId: "a",
        from,
        fromJail: false,
        path: [corner, (corner + 1) % 40],
      } as const;
      expect(arrivedSquare(step, HOP_MS - 1)).toBe(from);
      expect(arrivedSquare(step, HOP_MS)).toBe(corner);
      expect(arrivedSquare({ ...step, path: [corner] }, HOP_MS)).toBe(corner);
    });
  }

  test("a jump keeps its facing until it lands in Jail", () => {
    const step = { kind: "jump", playerId: "a", from: 30, fromJail: false, to: 10 } as const;
    expect(arrivedSquare(step, JUMP_MS - 1)).toBe(30);
    expect(arrivedSquare(step, JUMP_MS)).toBe(10);
  });
});
