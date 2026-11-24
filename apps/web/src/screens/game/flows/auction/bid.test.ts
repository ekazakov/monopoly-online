import { describe, expect, test } from "vite-plus/test";
import { tEn } from "../../../../testing/tEn.ts";
import { checkBid, minimumBid, quickAdd } from "./bid.ts";

describe("minimumBid", () => {
  test("is the opening bid, then the first raise", () => {
    expect(minimumBid(0)).toBe(10);
    expect(minimumBid(60)).toBe(70);
  });
});

describe("quickAdd", () => {
  test("adds the raise to the amount in the draft", () => {
    expect(quickAdd("60", 10, 50, 1500)).toEqual({ amount: 70, ok: true });
    expect(quickAdd(" 70 ", 50, 60, 1500)).toEqual({ amount: 120, ok: true });
    expect(quickAdd("70", 10, 60, 1500).amount).toBe(80);
  });

  test("adds to the minimum bid when the draft is empty or not a number", () => {
    expect(quickAdd("", 10, 0, 1500)).toEqual({ amount: 20, ok: true });
    expect(quickAdd("  ", 50, 60, 1500)).toEqual({ amount: 120, ok: true });
    expect(quickAdd("abc", 100, 0, 1500)).toEqual({ amount: 110, ok: true });
    expect(quickAdd("NaN", 10, 60, 1500).amount).toBe(80);
  });

  test("is not ok when the result is above the cash", () => {
    expect(quickAdd("100", 10, 0, 110)).toEqual({ amount: 110, ok: true });
    expect(quickAdd("101", 10, 0, 110)).toEqual({ amount: 111, ok: false });
    expect(quickAdd("", 100, 60, 100)).toEqual({ amount: 170, ok: false });
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

  test("accepts any whole bid of at least the best bid plus $10 after a bid", () => {
    for (const amount of [70, 75, 110, 160, 1000]) {
      expect(checkBid(String(amount), 60, 1500, tEn)).toEqual({ ok: true, amount });
    }
    for (const amount of ["60", "61", "69"]) {
      expect(checkBid(amount, 60, 1500, tEn).ok).toBe(false);
    }
    expect(checkBid("69", 60, 1500, tEn)).toEqual({
      ok: false,
      why: "The next bid is at least $70.",
    });
  });

  test("rejects a bid above the cash before it checks the raise", () => {
    expect(checkBid("160", 60, 100, tEn)).toEqual({
      ok: false,
      why: "You have $100. A bid cannot be more than your cash.",
    });
    expect(checkBid("100", 60, 100, tEn)).toEqual({ ok: true, amount: 100 });
    expect(checkBid("101", 60, 100, tEn).ok).toBe(false);
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
