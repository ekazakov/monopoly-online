import { BOARD_SIZE } from "@monopoly/game-engine";
import { describe, expect, test } from "vite-plus/test";
import {
  BAR_Z,
  CARD_COUNT,
  CARD_D,
  CARD_STACKS,
  CARD_T,
  CARD_W,
  CELL_H,
  MAX_SPREAD,
  RING,
  buildingSlots,
  cardJitter,
  layoutTokens,
  localToWorld,
  squareCell,
  tokenOffset,
  tokenScale,
} from "./layout.ts";

const squares = Array.from({ length: BOARD_SIZE }, (_, i) => i);

describe("squareCell", () => {
  test("puts the four corners at the corners, Start at +x/+z", () => {
    const at = (i: number) => {
      const { x, z, corner } = squareCell(i);
      return [x, z, corner];
    };
    expect(at(0)).toEqual([RING, RING, true]);
    expect(at(10)).toEqual([-RING, RING, true]);
    expect(at(20)).toEqual([-RING, -RING, true]);
    expect(at(30)).toEqual([RING, -RING, true]);
  });

  test("runs the first side from Start towards Jail along -x", () => {
    expect(squareCell(1)).toEqual({ x: 3.2, z: RING, rotationY: 0, corner: false });
    expect(squareCell(9).x).toBeCloseTo(-3.2);
  });

  test("matches the prototype positions for a square on each side", () => {
    // prototype: bottom (820 - 80k, 930), left (70, 820 - 80k), top (180 + 80k, 70), right (930, 180 + 80k)
    const w = (v: number) => (v - 500) / 100;
    expect(squareCell(4).x).toBeCloseTo(w(820 - 80 * 3));
    expect(squareCell(14).z).toBeCloseTo(w(820 - 80 * 3));
    expect(squareCell(24).x).toBeCloseTo(w(180 + 80 * 3));
    expect(squareCell(34).z).toBeCloseTo(w(180 + 80 * 3));
    expect(squareCell(14).x).toBeCloseTo(w(70));
    expect(squareCell(24).z).toBeCloseTo(w(70));
    expect(squareCell(34).x).toBeCloseTo(w(930));
    expect(squareCell(4).z).toBeCloseTo(w(930));
  });

  test("keeps all 40 squares apart", () => {
    const keys = new Set(
      squares.map((i) => `${squareCell(i).x.toFixed(2)},${squareCell(i).z.toFixed(2)}`),
    );
    expect(keys.size).toBe(BOARD_SIZE);
  });

  test("turns every side square so that its local -z points at the board centre", () => {
    for (const i of squares) {
      const cell = squareCell(i);
      if (cell.corner) continue;
      const [x, , z] = localToWorld({ x: 0, z: 0, rotationY: cell.rotationY }, 0, 0, -1);
      // the inner direction is the unit vector from the square to the origin along its axis
      const toCentre =
        Math.abs(cell.x) > Math.abs(cell.z) ? [-Math.sign(cell.x), 0] : [0, -Math.sign(cell.z)];
      expect(x).toBeCloseTo(toCentre[0]!);
      expect(z).toBeCloseTo(toCentre[1]!);
    }
  });

  test("rejects an index that is not on the board", () => {
    expect(() => squareCell(-1)).toThrow(RangeError);
    expect(() => squareCell(40)).toThrow(RangeError);
    expect(() => squareCell(1.5)).toThrow(RangeError);
  });
});

describe("tokenOffset and tokenScale", () => {
  test("gives every token of a group its own spot", () => {
    for (let n = 1; n <= MAX_SPREAD; n++) {
      const spots = new Set(Array.from({ length: n }, (_, k) => tokenOffset(k, n).join(",")));
      expect(spots.size).toBe(n);
    }
  });

  test("keeps the spots inside the width of a square", () => {
    for (let n = 1; n <= MAX_SPREAD; n++) {
      for (let k = 0; k < n; k++) {
        const [x, z] = tokenOffset(k, n);
        expect(Math.abs(x)).toBeLessThanOrEqual(0.385);
        expect(Math.abs(z)).toBeLessThan(0.685);
      }
    }
  });

  test("a single token stands alone at full size, a crowd shrinks", () => {
    expect(tokenScale(1)).toBe(1);
    expect(tokenScale(2)).toBeLessThan(1);
    expect(tokenScale(6)).toBeLessThan(tokenScale(4));
  });

  test("does not fail for more tokens than spots", () => {
    expect(tokenOffset(9, 9)).toEqual(tokenOffset(5, 6));
    expect(() => tokenOffset(0, 0)).toThrow(RangeError);
  });
});

describe("layoutTokens", () => {
  test("puts a lone token on its square", () => {
    const spots = layoutTokens([{ id: "a", square: 14 }]);
    const cell = squareCell(14);
    const { position, scale } = spots.get("a")!;
    expect(scale).toBe(1);
    expect(position[1]).toBe(CELL_H);
    expect(Math.hypot(position[0] - cell.x, position[2] - cell.z)).toBeLessThan(0.7);
  });

  test("spreads tokens that share a square", () => {
    const spots = layoutTokens([
      { id: "a", square: 26 },
      { id: "b", square: 26 },
      { id: "c", square: 26 },
    ]);
    const positions = ["a", "b", "c"].map((id) =>
      spots
        .get(id)!
        .position.map((v) => v.toFixed(3))
        .join(),
    );
    expect(new Set(positions).size).toBe(3);
    expect(spots.get("a")!.scale).toBeLessThan(1);
  });

  test("does not mix tokens of different squares", () => {
    const spots = layoutTokens([
      { id: "a", square: 3 },
      { id: "b", square: 4 },
    ]);
    expect(spots.get("a")!.scale).toBe(1);
    expect(spots.get("b")!.scale).toBe(1);
  });

  test("keeps prisoners apart from visitors on the jail corner", () => {
    const spots = layoutTokens([
      { id: "in", square: 10, inJail: true },
      { id: "out", square: 10, inJail: false },
    ]);
    const a = spots.get("in")!.position;
    const b = spots.get("out")!.position;
    // the cell is the top-left part of the corner: smaller x and z
    expect(a[0]).toBeLessThan(b[0]);
    expect(a[2]).toBeLessThan(b[2]);
    expect(spots.get("in")!.scale).toBe(1);
    expect(spots.get("out")!.scale).toBe(1);
  });

  test("lays out an empty list", () => {
    expect(layoutTokens([]).size).toBe(0);
  });

  test("stays on the corner for every corner", () => {
    for (const square of [0, 10, 20, 30]) {
      const cell = squareCell(square);
      const { position } = layoutTokens([
        { id: "a", square },
        { id: "b", square },
      ]).get("a")!;
      expect(Math.abs(position[0] - cell.x)).toBeLessThan(0.685 + 0.3);
      expect(Math.abs(position[2] - cell.z)).toBeLessThan(0.685 + 0.3);
    }
  });
});

describe("buildingSlots", () => {
  test("has no slot without houses", () => {
    expect(buildingSlots(0)).toEqual([]);
  });

  test("lines up 1 to 4 houses side by side, centred on the square", () => {
    for (let n = 1; n <= 4; n++) {
      const slots = buildingSlots(n);
      expect(slots).toHaveLength(n);
      expect(slots.every((s) => s.kind === "house")).toBe(true);
      const xs = slots.map((s) => s.position[0]);
      expect(xs.reduce((a, b) => a + b, 0)).toBeCloseTo(0);
      expect(new Set(xs.map((x) => x.toFixed(3))).size).toBe(n);
      expect(slots.every((s) => s.position[2] === BAR_Z)).toBe(true);
    }
  });

  test("keeps four houses inside the width of a square", () => {
    const xs = buildingSlots(4).map((s) => s.position[0]);
    expect(Math.max(...xs.map(Math.abs))).toBeLessThan(0.385 - 0.075);
  });

  test("turns five houses into one hotel", () => {
    const slots = buildingSlots(5);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ kind: "hotel" });
    expect(slots[0]!.position[0]).toBe(0);
  });

  test("clamps a count outside 0 to 5", () => {
    expect(buildingSlots(-2)).toEqual([]);
    expect(buildingSlots(9)).toEqual(buildingSlots(5));
  });
});

describe("card stacks", () => {
  test("lie in opposite corners of the centre, turned 45° with the long side along the diagonal", () => {
    const [chest, chance] = CARD_STACKS;
    expect(chest).toMatchObject({ deck: "chest", x: -chance!.x, z: -chance!.z });
    expect(chance!.x).toBe(chance!.z);
    // The long axis of the card (local x) points along +x/+z, as the old dashed places did.
    const axis = [Math.cos(chance!.rotation), -Math.sin(chance!.rotation)];
    expect(axis[0]).toBeCloseTo(axis[1]!);
    expect(axis[0]).toBeGreaterThan(0);
  });

  test("fit inside the centre field, under the height of the squares", () => {
    const reach = Math.hypot(CARD_W, CARD_D) / 2;
    for (const { x, z } of CARD_STACKS) {
      expect(Math.abs(x) + reach / Math.SQRT2).toBeLessThan(3.6);
      expect(Math.abs(z) + reach / Math.SQRT2).toBeLessThan(3.6);
    }
    expect(CARD_COUNT * CARD_T).toBeLessThan(CELL_H);
  });

  test("keep the jitter of a card small and the same on every call", () => {
    for (let i = 0; i < CARD_COUNT; i++) {
      const jitter = cardJitter(i);
      expect(Math.abs(jitter.x)).toBeLessThanOrEqual(0.025);
      expect(Math.abs(jitter.z)).toBeLessThanOrEqual(0.025);
      expect(Math.abs(jitter.rotation)).toBeLessThanOrEqual(0.04);
      expect(cardJitter(i)).toEqual(jitter);
    }
  });
});
