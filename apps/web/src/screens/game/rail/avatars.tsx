import { GLYPHS, GLYPH_STROKE } from "../../../scene/avatarGlyphs.ts";
import type { AvatarKind, GlyphShape } from "../../../scene/avatarGlyphs.ts";

// Outline avatar icons on a 48 x 48 grid (spec 4.3), ported from the prototype icons. The figure
// of a token has the key of the token. The shapes are in `scene/avatarGlyphs.ts`, so the board
// draws the same figures.
export type { AvatarKind };

function Shape({ shape }: { shape: GlyphShape }) {
  switch (shape.type) {
    case "path":
      return <path d={shape.d} strokeWidth={shape.strokeWidth} />;
    case "ellipse":
      return <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} />;
    case "circle":
      return shape.dot ? (
        <circle cx={shape.cx} cy={shape.cy} r={shape.r} fill="currentColor" stroke="none" />
      ) : (
        <circle cx={shape.cx} cy={shape.cy} r={shape.r} />
      );
  }
}

export function AvatarIcon({ kind, size = 38 }: { kind: AvatarKind; size?: number }) {
  const glyph = GLYPHS[kind];
  const shapes = glyph.shapes.map((shape, i) => <Shape key={i} shape={shape} />);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={GLYPH_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {glyph.offsetY ? <g transform={`translate(0 ${glyph.offsetY})`}>{shapes}</g> : shapes}
    </svg>
  );
}
