import type { AvatarKind } from "./sculpt.ts";

/**
 * The outline avatar glyphs on a 48 x 48 grid (spec 4.3), as plain data. The player rail draws
 * them as SVG and the board draws them on a canvas, so both show the same figure for a token.
 */
export type { AvatarKind };

/** A stroked outline. `dot` shapes are filled and have no stroke. */
export type GlyphShape =
  | { type: "path"; d: string; strokeWidth?: number }
  | { type: "circle"; cx: number; cy: number; r: number; dot?: boolean }
  | { type: "ellipse"; cx: number; cy: number; rx: number; ry: number };

export interface Glyph {
  /** A vertical shift of all the shapes, in grid units. */
  offsetY?: number;
  shapes: readonly GlyphShape[];
}

export const GLYPH_GRID = 48;
export const GLYPH_STROKE = 2.4;

const dot = (cx: number, cy: number, r: number): GlyphShape => ({
  type: "circle",
  cx,
  cy,
  r,
  dot: true,
});

export const GLYPHS: Record<AvatarKind, Glyph> = {
  cat: {
    shapes: [
      {
        type: "path",
        d: "M13.6 13L13 3.5L20 8Q24 7 28 8L35 3.5L34.4 13Q36 15 35 18Q32 26 24 26Q16 26 13 18Q12 15 13.6 13Z",
      },
      { type: "path", d: "M17 25.5C13 30 12 36 14 42H34C36 36 35 30 31 25.5" },
      { type: "path", d: "M24 33V42" },
      { type: "path", d: "M34 41C41 41 44 36 43 31C42.5 28 40 27.5 39 29" },
      { type: "path", d: "M22.8 19.5H25.2L24 21Z" },
      {
        type: "path",
        d: "M9.5 18.5L14.5 19.5M9.5 22L14.5 21.5M38.5 18.5L33.5 19.5M38.5 22L33.5 21.5",
        strokeWidth: 1.6,
      },
      dot(19.5, 15.5, 1.1),
      dot(28.5, 15.5, 1.1),
    ],
  },
  dog: {
    shapes: [
      {
        type: "path",
        d: "M5 15.5L15 12L22 13.5L37 15C40 15.5 41 18 41 21V33H15V25.5L10.5 19.5L6 18.5C4.5 18.2 4 16.5 5 15.5Z",
      },
      { type: "path", d: "M15.5 12L17 4L21.5 13.2" },
      { type: "path", d: "M37.5 15.2L41.5 6L44 7.5L41 18" },
      { type: "path", d: "M17 33V40H22V33M34 33V40H39V33" },
      { type: "path", d: "M8.5 19.5L8 23M11.5 21L11 25", strokeWidth: 1.8 },
      dot(11.5, 15.8, 1.1),
      dot(5.8, 16, 1.4),
    ],
  },
  penguin: {
    shapes: [
      {
        type: "path",
        d: "M24 4C15 4 12 12 12 22C12 33 15 41 24 41C33 41 36 33 36 22C36 12 33 4 24 4Z",
      },
      {
        type: "path",
        d: "M24 19C19.5 19 17.5 24 17.5 30C17.5 35.5 20 39.5 24 39.5C28 39.5 30.5 35.5 30.5 30C30.5 24 28.5 19 24 19Z",
      },
      { type: "path", d: "M12.5 20C8 23 6.5 29 7.5 34C10 32.5 12 29 12.8 26" },
      { type: "path", d: "M35.5 20C40 23 41.5 29 40.5 34C38 32.5 36 29 35.2 26" },
      { type: "path", d: "M21.5 13.5H26.5L24 17.5Z" },
      { type: "ellipse", cx: 18, cy: 43.5, rx: 4.5, ry: 2 },
      { type: "ellipse", cx: 30, cy: 43.5, rx: 4.5, ry: 2 },
      dot(20, 10, 1.2),
      dot(28, 10, 1.2),
    ],
  },
  car: {
    offsetY: -5,
    shapes: [
      {
        type: "path",
        d: "M4 34V29.5Q4 27.5 6 27L18 25L22 20.5H30L33 25L41.5 27Q44 27.5 44 30V34H39.5A6.5 6.5 0 0 0 26.5 34H21.5A6.5 6.5 0 0 0 8.5 34Z",
      },
      { type: "path", d: "M21 24.5L23.5 21.8H28.5L30.5 24.5Z" },
      { type: "circle", cx: 15, cy: 34, r: 4.5 },
      { type: "circle", cx: 33, cy: 34, r: 4.5 },
      dot(15, 34, 1.2),
      dot(33, 34, 1.2),
    ],
  },
  horse: {
    shapes: [
      {
        type: "path",
        d: "M5.5 24.5L4 21.5C4 19.5 5.5 18 7 16.5L11.5 11L12.5 4.5L17 9.5C20 9 24 10 28 12H36C40 12 43 15 43 19V30H38V41H33.5V30H21V41H16.5V30L14 20.5L9.5 26.5C8 27.5 6.5 26.5 5.5 24.5Z",
      },
      { type: "path", d: "M43 17C46.5 19.5 46.5 28 44 35" },
      { type: "path", d: "M14 12.5L16.5 17.5M18 10.5L20.5 15.5", strokeWidth: 1.8 },
      dot(9.8, 17.6, 1.1),
      dot(5.6, 22.2, 1),
    ],
  },
  duck: {
    shapes: [
      { type: "circle", cx: 14, cy: 12, r: 6.5 },
      { type: "path", d: "M8 12.5L2.5 14.5L8.5 17" },
      {
        type: "path",
        d: "M11.5 17.8C10 22 8 25 8 29C8 37 15 42 25 42C36 42 41 36.5 42 30L45 22L38 25.5C34 25.5 31 22.5 27 22C22 21.5 19 21 17.5 17.8",
      },
      { type: "path", d: "M20 31C24 28 31 29 34 33C31 37 24 37 20 31Z" },
      dot(12, 10.8, 1.1),
    ],
  },
};

/**
 * Draws the glyph of `kind` in `color` on a canvas, `size` pixels square, with its top left corner
 * at `x`, `y`. The strokes scale with the glyph, as in the SVG. A `weight` above 1 makes them
 * thicker, for a glyph that is small on the screen.
 */
export function drawGlyph(
  g: CanvasRenderingContext2D,
  kind: AvatarKind,
  x: number,
  y: number,
  size: number,
  color: string,
  weight = 1,
): void {
  const glyph = GLYPHS[kind];
  g.save();
  g.translate(x, y);
  g.scale(size / GLYPH_GRID, size / GLYPH_GRID);
  g.translate(0, glyph.offsetY ?? 0);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const shape of glyph.shapes) {
    if (shape.type === "path") {
      g.lineWidth = (shape.strokeWidth ?? GLYPH_STROKE) * weight;
      g.stroke(new Path2D(shape.d));
      continue;
    }
    g.lineWidth = GLYPH_STROKE * weight;
    g.beginPath();
    // a dot grows with the weight too, so the eyes stay visible next to the thicker outlines
    if (shape.type === "circle")
      g.arc(shape.cx, shape.cy, shape.r * (shape.dot ? weight : 1), 0, Math.PI * 2);
    else g.ellipse(shape.cx, shape.cy, shape.rx, shape.ry, 0, 0, Math.PI * 2);
    if (shape.type === "circle" && shape.dot) g.fill();
    else g.stroke();
  }
  g.restore();
}
