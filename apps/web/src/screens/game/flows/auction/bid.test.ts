import { describe, expect, test } from "vite-plus/test";
import { tEn } from "../../../../testing/tEn.ts";
import { checkBid, minimumBid, raiseTargets } from "./bid.ts";

describe("minimumBid", () => {
  test("is the opening bid, then the first raise", () => {
    expect(minimumBid(0)).toBe(10);
    expect(minimumBid(60)).toBe(70);
  });
});

describe("raiseTargets", () => {
  test("adds each raise to the best bid", () => {
    expect(raiseTargets(60).map((item) => item.target)).toEqual([70, 110, 160]);
    expect(raiseTargets(0).map((item) => item.target)).toEqual([10, 50, 100]);
  });
});

describe("checkBid", () => {
  test("accepts any whole opening bid from $10 up to the cash", () => {
    expect(checkBid("10", 0, 1500, tEn)).toEqual({ ok: true, amount: 10 });
    expect(checkBid("$1,234", 0, 1500, tEn)).toEqual({ ok: true, amount: 1234 });
    expect(checkBid("1500", 0, 1500, tEn)).toEqual({ ok: true, amount: 1500 });
  });

  test("rejects an opening bid below $10", () => {
    expect(checkBid("9", 0, 1500, tEn)).toEqual({
      ok: false,
      why: "The opening bid is at least $10.",
    });
  });

  test("accepts only the best bid plus $10, $50 or $100 after a bid", () => {
    for (const amount of [70, 110, 160]) {
      expect(checkBid(String(amount), 60, 1500, tEn)).toEqual({ ok: true, amount });
    }
    for (const amount of ["60", "61", "75", "120", "200"]) {
      expect(checkBid(amount, 60, 1500, tEn).ok).toBe(false);
    }
    expect(checkBid("75", 60, 1500, tEn)).toEqual({
      ok: false,
      why: "The next bid is $70, $110 or $160.",
    });
  });

  test("rejects a bid above the cash before it checks the raise", () => {
    expect(checkBid("160", 60, 100, tEn)).toEqual({
      ok: false,
      why: "You have $100. A bid cannot be more than your cash.",
    });
    expect(checkBid("100", 60, 100, tEn).ok).toBe(false);
    expect(checkBid("110", 100, 110, tEn)).toEqual({ ok: true, amount: 110 });
  });

  test("rejects empty and non-integer text", () => {
    expect(checkBid("", 0, 1500, tEn).ok).toBe(false);
    expect(checkBid("  ", 0, 1500, tEn).ok).toBe(false);
    expect(checkBid("12.5", 0, 1500, tEn)).toEqual({
      ok: false,
      why: "A bid is a whole number of dollars.",
    });
    expect(checkBid("abc", 0, 1500, tEn).ok).toBe(false);
    expect(checkBid("-10", 0, 1500, tEn).ok).toBe(false);
  });
});
