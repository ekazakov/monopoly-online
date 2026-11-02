import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";

const css = readFileSync(join(import.meta.dirname, "tokens.css"), "utf8");

function definedTokens(source: string): Set<string> {
  return new Set([...source.matchAll(/^\s*(--hf-[a-z0-9-]+)\s*:/gm)].map((m) => m[1]!));
}

const required: Record<string, string[]> = {
  "shell colour": [
    "ground",
    "table",
    "panel",
    "panel-log",
    "panel-glass",
    "panel-line",
    "ink",
    "ink-soft",
    "ring",
    "accent",
    "accent-hover",
    "accent-ink",
    "focus",
    "hover",
    "ok",
    "danger",
    "danger-ink",
  ],
  "board surface": [
    "slab",
    "edge",
    "centre",
    "paper",
    "board-ink",
    "zone-ink",
    "base",
    "board-red",
    "chance",
    "chest",
    "coin",
    "coin-rim",
  ],
  "street colours": [
    "street-brown",
    "street-sky",
    "street-pink",
    "street-orange",
    "street-red",
    "street-yellow",
    "street-green",
    "street-navy",
    "street-station",
    "street-utility",
  ],
  pieces: [
    "pawn-red",
    "pawn-blue",
    "pawn-green",
    "pawn-gold",
    "die",
    "die-edge",
    "pip",
    "house",
    "house-roof",
    "hotel",
    "hotel-roof",
  ],
  "type families": ["font-display", "font-body"],
  "type scale": [
    "type-display-xl",
    "type-display-l",
    "type-display-m",
    "type-display-s",
    "type-body",
    "type-body-small",
    "type-label",
    "type-price",
    "type-caption",
    "track-display-xl",
    "track-display-l",
    "track-display-m",
    "track-display-s",
    "track-label",
  ],
  spacing: [2, 4, 6, 8, 12, 16, 24, 32, 48, 64]
    .map((px) => `space-${px}`)
    .concat("gutter", "target"),
  radius: ["radius-control", "radius-panel", "radius-dialog", "radius-pill"],
  elevation: ["elev-0", "elev-1", "elev-2", "elev-3", "blur-panel"],
  motion: [
    "dur-fast",
    "dur-base",
    "dur-hop",
    "dur-camera",
    "ease-out",
    "ease-in-out",
    "ease-camera",
  ],
};

describe("design tokens", () => {
  const defined = definedTokens(css);

  for (const [group, names] of Object.entries(required)) {
    test(`defines the ${group} tokens`, () => {
      const missing = names.map((n) => `--hf-${n}`).filter((n) => !defined.has(n));
      expect(missing).toEqual([]);
    });
  }

  test("keeps the spec colour values", () => {
    expect(css).toMatch(/--hf-ground:\s*#0e1822;/);
    expect(css).toMatch(/--hf-accent:\s*#e2574c;/);
    expect(css).toMatch(/--hf-accent-ink:\s*#1a0b09;/);
    expect(css).toMatch(/--hf-ink:\s*#e9f0ea;/);
  });

  test("zeroes every duration under reduced motion", () => {
    const block =
      css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*)\}\s*$/)?.[1] ?? "";
    const zeroed = definedTokens(block);
    const durations = [...defined].filter((n) => n.startsWith("--hf-dur-"));
    expect(durations.length).toBeGreaterThan(0);
    expect([...zeroed].sort()).toEqual(durations.sort());
  });
});
