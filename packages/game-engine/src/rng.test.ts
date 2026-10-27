import { describe, expect, test } from "vite-plus/test";
import { createRng, nextInt, rollDice, shuffle } from "./rng.ts";
import type { RngState } from "./rng.ts";

function rolls(seed: number, count: number): number[] {
  let rng = createRng(seed);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const r = nextInt(rng, 1000);
    out.push(r.value);
    rng = r.rng;
  }
  return out;
}

describe("rng", () => {
  test("same seed gives the same sequence", () => {
    expect(rolls(42, 20)).toEqual(rolls(42, 20));
  });

  test("different seeds give different sequences", () => {
    expect(rolls(1, 20)).not.toEqual(rolls(2, 20));
  });

  test("does not change the input state", () => {
    const rng = createRng(7);
    nextInt(rng, 10);
    expect(rng).toEqual(createRng(7));
  });

  test("state survives a JSON round trip", () => {
    const rng = createRng(99);
    const restored = JSON.parse(JSON.stringify(rng)) as RngState;
    expect(nextInt(restored, 1000)).toEqual(nextInt(rng, 1000));
  });

  test("nextInt stays in range", () => {
    const values = rolls(3, 500);
    expect(values.every((v) => v >= 0 && v < 1000)).toBe(true);
  });

  test("nextInt rejects a bad max", () => {
    expect(() => nextInt(createRng(1), 0)).toThrow(RangeError);
    expect(() => nextInt(createRng(1), 1.5)).toThrow(RangeError);
  });

  test("dice are 1 to 6 and every face appears", () => {
    let rng = createRng(5);
    const seen = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const r = rollDice(rng);
      rng = r.rng;
      r.value.forEach((d) => seen.add(d));
    }
    expect([...seen].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test("shuffle keeps all items, is deterministic, and keeps the input", () => {
    const items = Array.from({ length: 16 }, (_, i) => i);
    const a = shuffle(createRng(11), items);
    const b = shuffle(createRng(11), items);
    expect(a.value).toEqual(b.value);
    expect([...a.value].sort((x, y) => x - y)).toEqual(items);
    expect(a.value).not.toEqual(items);
    expect(items[0]).toBe(0);
  });
});
