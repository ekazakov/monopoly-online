import { describe, expect, test } from "vite-plus/test";
import {
  BOARD_SIZE,
  CHANCE_CARDS,
  CHEST_CARDS,
  SQUARES,
  STATION_RENT,
  groupSquares,
  isProperty,
} from "./index.ts";

const count = (kind: string) => SQUARES.filter((s) => s.kind === kind).length;

describe("board data", () => {
  test("has 40 squares", () => {
    expect(SQUARES).toHaveLength(BOARD_SIZE);
  });

  test("has the expected square kinds", () => {
    expect(count("street")).toBe(22);
    expect(count("station")).toBe(4);
    expect(count("utility")).toBe(2);
    expect(count("chance")).toBe(3);
    expect(count("chest")).toBe(3);
    expect(count("tax")).toBe(2);
    expect(SQUARES[0]?.kind).toBe("go");
    expect(SQUARES[10]?.kind).toBe("jail");
    expect(SQUARES[20]?.kind).toBe("free_parking");
    expect(SQUARES[30]?.kind).toBe("go_to_jail");
  });

  test("groups have the expected sizes", () => {
    const sizes = {
      brown: 2,
      sky: 3,
      pink: 3,
      orange: 3,
      red: 3,
      yellow: 3,
      green: 3,
      navy: 2,
      station: 4,
      utility: 2,
    } as const;
    for (const [group, size] of Object.entries(sizes)) {
      expect(groupSquares(group as keyof typeof sizes)).toHaveLength(size);
    }
  });

  test("total price of all properties is $5,690", () => {
    const total = SQUARES.filter(isProperty).reduce((sum, s) => sum + s.price, 0);
    expect(total).toBe(5690);
  });

  test("mortgage is half the price", () => {
    for (const square of SQUARES.filter(isProperty)) {
      expect(square.mortgage).toBe(square.price / 2);
    }
  });

  test("rent grows with buildings", () => {
    for (const square of SQUARES.flatMap((s) => (s.kind === "street" ? [s] : []))) {
      expect([...square.rent].sort((x, y) => x - y)).toEqual([...square.rent]);
    }
    expect(STATION_RENT).toEqual([25, 50, 100, 200]);
  });

  test("tax squares charge the flat amounts", () => {
    const taxes = SQUARES.flatMap((s) => (s.kind === "tax" ? [s.amount] : []));
    expect(taxes).toEqual([200, 100]);
  });
});

describe("card data", () => {
  test("each deck has 16 cards and one jail card", () => {
    for (const deck of [CHANCE_CARDS, CHEST_CARDS]) {
      expect(deck).toHaveLength(16);
      expect(deck.filter((c) => c.effect.type === "jail_free")).toHaveLength(1);
    }
  });

  test("move cards point at real squares", () => {
    const targets = [...CHANCE_CARDS, ...CHEST_CARDS].flatMap((c) =>
      c.effect.type === "move_to" ? [c.effect.square] : [],
    );
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((square) => SQUARES[square] !== undefined)).toBe(true);
  });
});
