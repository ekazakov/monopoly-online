import { SQUARES } from "@monopoly/game-engine";
import { describe, expect, test } from "vite-plus/test";
import { priceLabel, wrapLines } from "./textures.ts";

// one unit per character, so a width is a character count
const chars = (t: string) => t.length;

describe("wrapLines", () => {
  test("keeps a short text on one line", () => {
    expect(wrapLines("GRAND PIER", 20, chars)).toEqual(["GRAND PIER"]);
  });

  test("breaks between words when the line is too wide", () => {
    expect(wrapLines("CUSTOMS HOUSE ROW", 13, chars)).toEqual(["CUSTOMS HOUSE", "ROW"]);
    expect(wrapLines("FISHMARKET SQUARE", 10, chars)).toEqual(["FISHMARKET", "SQUARE"]);
  });

  test("leaves a word that is wider than the line whole", () => {
    expect(wrapLines("SHIPWRIGHT STREET", 5, chars)).toEqual(["SHIPWRIGHT", "STREET"]);
  });

  test("returns one empty line for an empty text", () => {
    expect(wrapLines("", 10, chars)).toEqual([""]);
  });
});

describe("priceLabel", () => {
  test("shows a price for each property kind", () => {
    const byKind = (kind: string) => SQUARES.find((s) => s.kind === kind)!;
    expect(priceLabel(byKind("street"))).toBe("$60");
    expect(priceLabel(byKind("station"))).toBe("$200");
    expect(priceLabel(byKind("utility"))).toBe("$150");
  });

  test("shows the amount of a tax square", () => {
    expect(priceLabel(SQUARES[4]!)).toBe("Pay $200");
    expect(priceLabel(SQUARES[38]!)).toBe("Pay $100");
  });

  test("shows nothing for cards and corners", () => {
    for (const kind of ["chance", "chest", "go", "jail", "free_parking", "go_to_jail"]) {
      expect(priceLabel(SQUARES.find((s) => s.kind === kind)!)).toBe("");
    }
  });
});
