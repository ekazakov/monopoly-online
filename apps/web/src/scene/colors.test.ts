import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SQUARES } from "@monopoly/game-engine";
import type { SquareGroup } from "@monopoly/game-engine";
import { describe, expect, test } from "vite-plus/test";
import { TOKENS } from "@monopoly/shared";
import {
  GROUP_COLORS,
  SURFACE,
  TOKEN_LOOKS,
  UNKNOWN_OWNER_COLOR,
  contrastRatio,
  groupColor,
  markerColor,
  tokenLook,
} from "./colors.ts";

const css = readFileSync(join(import.meta.dirname, "../styles/tokens.css"), "utf8");
const token = (name: string) =>
  new RegExp(`--hf-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1]?.toLowerCase();

describe("groupColor", () => {
  test("has a colour for every group the engine uses", () => {
    const groups = new Set<SquareGroup>();
    for (const square of SQUARES) if ("group" in square) groups.add(square.group);
    expect(groups.size).toBe(10);
    for (const group of groups) expect(groupColor(group)).toMatch(/^#[0-9a-f]{6}$/);
  });

  test("equals the --hf-street-* design tokens", () => {
    for (const [group, hex] of Object.entries(GROUP_COLORS)) {
      expect([group, token(`street-${group}`)]).toEqual([group, hex]);
    }
  });
});

describe("tokenLook", () => {
  test("has a look for each token, in the free-token order", () => {
    expect(Object.keys(TOKEN_LOOKS)).toEqual([...TOKENS]);
  });

  test("the first four colours equal the --hf-pawn-* design tokens", () => {
    expect(TOKENS.slice(0, 4).map((t) => tokenLook(t).hex)).toEqual(
      ["red", "blue", "green", "gold"].map((n) => token(`pawn-${n}`)),
    );
    expect(TOKENS.slice(0, 4).map((t) => tokenLook(t).cssColor)).toEqual(
      ["red", "blue", "green", "gold"].map((n) => `var(--hf-pawn-${n})`),
    );
  });

  test("the purple and teal colours carry their value as the CSS fallback", () => {
    expect(tokenLook("horse").cssColor).toBe(`var(--hf-pawn-purple, ${tokenLook("horse").hex})`);
    expect(tokenLook("duck").cssColor).toBe(`var(--hf-pawn-teal, ${tokenLook("duck").hex})`);
  });

  test("pairs each token with the figure of the same key", () => {
    for (const t of TOKENS) expect(tokenLook(t).avatar).toBe(t);
  });

  test("gives six tokens six different colours and metals", () => {
    for (const field of ["hex", "metal"] as const) {
      expect(new Set(TOKENS.map((t) => tokenLook(t)[field])).size).toBe(6);
    }
  });
});

describe("board surface colours", () => {
  test("equal the --hf board tokens", () => {
    expect(token("slab")).toBe(SURFACE.slab);
    expect(token("edge")).toBe(SURFACE.edge);
    expect(token("centre")).toBe(SURFACE.centre);
    expect(token("paper")).toBe(SURFACE.paper);
    expect(token("marker-band")).toBe(SURFACE.markerBand);
    expect(token("board-ink")).toBe(SURFACE.ink);
    expect(token("zone-ink")).toBe(SURFACE.zoneInk);
    expect(token("base")).toBe(SURFACE.base);
    expect(token("board-red")).toBe(SURFACE.red);
    expect(token("chance")).toBe(SURFACE.chance);
    expect(token("chest")).toBe(SURFACE.chest);
    expect(token("house")).toBe(SURFACE.house);
    expect(token("house-roof")).toBe(SURFACE.houseRoof);
    expect(token("hotel")).toBe(SURFACE.hotel);
    expect(token("hotel-roof")).toBe(SURFACE.hotelRoof);
    expect(UNKNOWN_OWNER_COLOR).toBe(token("ink-soft"));
  });
});

describe("owner marker colours", () => {
  test("a deed that is not mortgaged keeps the owner colour", () => {
    expect(markerColor("#d9392f", false)).toBe("#d9392f");
  });

  test("a mortgaged deed gives an opaque, lighter colour", () => {
    expect(markerColor("#000000", true)).toBe("#838680");
    expect(markerColor("#d9392f", true)).toMatch(/^#[0-9a-f]{6}$/);
  });

  test("the glyph on the white chip reads, mortgaged or not, and the price reads on the band", () => {
    for (const mortgaged of [false, true]) {
      expect(contrastRatio("#ffffff", markerColor(SURFACE.ink, mortgaged))).toBeGreaterThanOrEqual(
        3,
      );
    }
    expect(contrastRatio(SURFACE.markerBand, SURFACE.ink)).toBeGreaterThanOrEqual(4.5);
  });
});
