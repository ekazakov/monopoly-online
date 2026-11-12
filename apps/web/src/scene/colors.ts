import type { SquareGroup } from "@monopoly/game-engine";
import type { Token } from "@monopoly/shared";
import type { AvatarKind } from "./sculpt.ts";

// Hex copies of the --hf-street-* tokens in styles/tokens.css. Three.js cannot read CSS variables,
// and colors.test.ts checks that both stay equal.
export const GROUP_COLORS: Record<SquareGroup, string> = {
  brown: "#8a5a3c",
  sky: "#9bd4ea",
  pink: "#d9569b",
  orange: "#ee8a2c",
  red: "#d93a32",
  yellow: "#f2cd2e",
  green: "#2f9e5b",
  navy: "#2459a6",
  station: "#17211b",
  utility: "#a9bcc9",
};

export function groupColor(group: SquareGroup): string {
  return GROUP_COLORS[group];
}

export interface TokenLook {
  /** What the figure is called, for labels such as "Horse, taken by Ann". */
  label: string;
  /** A short name that fits under the figure in the token picker. */
  short: string;
  /** CSS colour: a `--hf-pawn-*` token. Purple and teal carry their value as the fallback. */
  cssColor: string;
  /** The same colour as hex, for Three.js and for canvas. */
  hex: string;
  /** Metal finish of the 3D figure, a little brighter than the colour so it reads under the studio light. */
  metal: number;
  avatar: AvatarKind;
}

/**
 * The one look table. A seat has a token and a token has one fixed colour and figure: red terrier,
 * blue cat, green penguin, gold racing car, purple horse, teal duck. The key order is the
 * free-token order of `TOKENS`.
 */
export const TOKEN_LOOKS: Record<Token, TokenLook> = {
  dog: {
    label: "Scottish terrier",
    short: "Terrier",
    cssColor: "var(--hf-pawn-red)",
    hex: "#d9392f",
    metal: 0xe0463c,
    avatar: "dog",
  },
  cat: {
    label: "Cat",
    short: "Cat",
    cssColor: "var(--hf-pawn-blue)",
    hex: "#2f6fd0",
    metal: 0x3f7fe0,
    avatar: "cat",
  },
  penguin: {
    label: "Penguin",
    short: "Penguin",
    cssColor: "var(--hf-pawn-green)",
    hex: "#2fa05c",
    metal: 0x35b066,
    avatar: "penguin",
  },
  car: {
    label: "Racing car",
    short: "Car",
    cssColor: "var(--hf-pawn-gold)",
    hex: "#f0b429",
    metal: 0xf6c244,
    avatar: "car",
  },
  horse: {
    label: "Horse",
    short: "Horse",
    cssColor: "var(--hf-pawn-purple, #8e5fd6)",
    hex: "#8e5fd6",
    metal: 0x9d70e4,
    avatar: "horse",
  },
  duck: {
    label: "Duck",
    short: "Duck",
    cssColor: "var(--hf-pawn-teal, #27b3ad)",
    hex: "#27b3ad",
    metal: 0x33c4be,
    avatar: "duck",
  },
};

export const tokenLook = (token: Token): TokenLook => TOKEN_LOOKS[token];

/** Owner marker colour for a deed whose owner is not among the known players. */
export const UNKNOWN_OWNER_COLOR = "#a9bcc9";

// Board surface colours, copies of the --hf-* board tokens.
export const SURFACE = {
  slab: "#e9e2cf",
  edge: "#cdd6c6",
  centre: "#cfe3cc",
  paper: "#eef4e9",
  /** The owner band at the outer edge of an owned square. Neutral, so it never looks like a group. */
  markerBand: "#d3ddcd",
  ink: "#17211b",
  zoneInk: "#2f4a3b",
  base: "#1d2b24",
  red: "#c8322b",
  chance: "#c0302a",
  chest: "#1f4f96",
  house: "#38b36a",
  houseRoof: "#1f7a46",
  hotel: "#d4372f",
  hotelRoof: "#8e231d",
} as const;

/** Tint of the top face of a mortgaged square. */
export const MORTGAGED_TINT = "#a7ada3";
/** Colour of the glow on a highlighted square. */
export const HIGHLIGHT_COLOR = "#e2574c";

const channel = (hex: string, i: number) => Number.parseInt(hex.slice(i, i + 2), 16);

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = channel(hex, i) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two `#rrggbb` colours. */
export const contrastRatio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

/** How much of the owner colour stays on the marker of a mortgaged deed. */
const MORTGAGED_MARKER_SHARE = 0.45;

/**
 * A colour on the owner band: the ring of the owner chip, or the ink of its glyph and price. A
 * mortgaged deed dims it by mixing it with the paper, so the band still hides the square price.
 */
export function markerColor(hex: string, mortgaged: boolean): string {
  if (!mortgaged) return hex;
  const mix = (i: number) =>
    Math.round(
      channel(hex, i) * MORTGAGED_MARKER_SHARE +
        channel(SURFACE.paper, i) * (1 - MORTGAGED_MARKER_SHARE),
    )
      .toString(16)
      .padStart(2, "0");
  return `#${mix(1)}${mix(3)}${mix(5)}`;
}
