import { TOKENS } from "@monopoly/shared";
import { describe, expect, test, vi } from "vite-plus/test";
import { GLYPHS, drawGlyph } from "./avatarGlyphs.ts";

describe("avatar glyphs", () => {
  test("has shapes for every token", () => {
    expect(Object.keys(GLYPHS).sort()).toEqual([...TOKENS].sort());
    for (const token of TOKENS) expect(GLYPHS[token].shapes.length).toBeGreaterThan(0);
  });

  test("draws each shape once and restores the canvas state", () => {
    // jsdom has no canvas, so a fake context counts the calls
    const call = () => vi.fn<() => void>();
    const g = {
      save: call(),
      restore: call(),
      translate: call(),
      scale: call(),
      beginPath: call(),
      arc: call(),
      ellipse: call(),
      fill: call(),
      stroke: call(),
    };
    vi.stubGlobal("Path2D", class {});
    drawGlyph(g as unknown as CanvasRenderingContext2D, "penguin", 0, 0, 48, "#000");
    const shapes = GLYPHS.penguin.shapes;
    expect(g.stroke.mock.calls.length + g.fill.mock.calls.length).toBe(shapes.length);
    expect(g.ellipse).toHaveBeenCalledTimes(shapes.filter((s) => s.type === "ellipse").length);
    expect(g.save).toHaveBeenCalledOnce();
    expect(g.restore).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
