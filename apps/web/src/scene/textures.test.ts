import { SQUARES } from "@monopoly/game-engine";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import {
  OWNER_BAND_W,
  createBoardTextures,
  ownerBandLayout,
  priceLabel,
  wrapLines,
} from "./textures.ts";

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

describe("ownerBandLayout", () => {
  const place = (width: number) => {
    const l = ownerBandLayout(width);
    const half = (width * l.priceScale) / 2;
    return {
      l,
      clear: l.chipX + l.chipR <= l.priceX - half,
      inside: l.priceX + half <= OWNER_BAND_W,
    };
  };

  test("puts the chip left of the price, clear of it, at full size", () => {
    const { l, clear, inside } = place(100);
    expect(l.priceScale).toBe(1);
    expect(clear).toBe(true);
    expect(inside).toBe(true);
  });

  test("makes a wide price smaller, so the chip never covers it", () => {
    const { l, clear, inside } = place(400);
    expect(l.priceScale).toBeLessThan(1);
    expect(clear).toBe(true);
    expect(inside).toBe(true);
  });

  test("centres the chip when there is no price", () => {
    expect(ownerBandLayout(0).chipX).toBe(OWNER_BAND_W / 2);
  });
});

describe("owner band textures", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("shares one texture for each price, owner and mortgage state, and disposes all", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const textures = createBoardTextures(SQUARES, 1);
    const street = SQUARES.findIndex((s) => s.kind === "street");
    const a = textures.ownerBand(street, "cat", false);
    expect(textures.ownerBand(street, "cat", false)).toBe(a);
    const b = textures.ownerBand(street, "dog", false);
    const c = textures.ownerBand(street, "cat", true);
    const d = textures.ownerBand(street, undefined, false);
    expect(new Set([a, b, c, d]).size).toBe(4);

    const spies = [a, b, c, d].map((t) => vi.spyOn(t, "dispose"));
    textures.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  });
});
