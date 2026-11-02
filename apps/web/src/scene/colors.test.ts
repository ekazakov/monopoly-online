import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SQUARES } from "@monopoly/game-engine";
import type { SquareGroup } from "@monopoly/game-engine";
import { describe, expect, test } from "vite-plus/test";
import {
  GROUP_COLORS,
  PLAYER_LOOKS,
  SURFACE,
  UNKNOWN_OWNER_COLOR,
  groupColor,
  playerLook,
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

describe("playerLook", () => {
  test("starts with the --hf-pawn-* tokens, in token order", () => {
    expect(PLAYER_LOOKS.slice(0, 4).map((l) => l.color)).toEqual(
      ["red", "blue", "green", "gold"].map((n) => token(`pawn-${n}`)),
    );
  });

  test("pairs each pawn colour with its avatar from the design", () => {
    expect(playerLook(0).avatar).toBe("dog");
    expect(playerLook(1).avatar).toBe("cat");
    expect(playerLook(2).avatar).toBe("penguin");
    expect(playerLook(3).avatar).toBe("car");
  });

  test("gives six players six different colours", () => {
    expect(new Set(PLAYER_LOOKS.map((l) => l.color)).size).toBe(6);
  });

  test("wraps an index past the end and a negative index", () => {
    expect(playerLook(6)).toBe(playerLook(0));
    expect(playerLook(-1)).toBe(playerLook(5));
  });
});

describe("board surface colours", () => {
  test("equal the --hf board tokens", () => {
    expect(token("slab")).toBe(SURFACE.slab);
    expect(token("edge")).toBe(SURFACE.edge);
    expect(token("centre")).toBe(SURFACE.centre);
    expect(token("paper")).toBe(SURFACE.paper);
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
