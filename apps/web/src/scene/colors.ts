import type { SquareGroup } from "@monopoly/game-engine";
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

export interface PlayerLook {
  /** Pawn colour: the --hf-pawn-* tokens, then two more for games of five and six. */
  color: string;
  /** Metal finish of the 3D figure, a little brighter than the colour so it reads under the studio light. */
  metal: number;
  avatar: AvatarKind;
}

// The colour decides the avatar, as in the design: red terrier, blue cat, green penguin, gold racing car.
// The sculpted set has four figures, so the fifth and sixth player reuse two of them in a new colour.
export const PLAYER_LOOKS: readonly PlayerLook[] = [
  { color: "#d9392f", metal: 0xe0463c, avatar: "dog" },
  { color: "#2f6fd0", metal: 0x3f7fe0, avatar: "cat" },
  { color: "#2fa05c", metal: 0x35b066, avatar: "penguin" },
  { color: "#f0b429", metal: 0xf6c244, avatar: "car" },
  { color: "#8e5fd6", metal: 0x9d70e4, avatar: "cat" },
  { color: "#27b3ad", metal: 0x33c4be, avatar: "dog" },
];

/** Look of the player with this colour index. An index past the end wraps round. */
export function playerLook(colorIndex: number): PlayerLook {
  const n = PLAYER_LOOKS.length;
  return PLAYER_LOOKS[((Math.trunc(colorIndex) % n) + n) % n]!;
}

/** Owner marker colour for a deed whose owner is not among the known players. */
export const UNKNOWN_OWNER_COLOR = "#a9bcc9";

// Board surface colours, copies of the --hf-* board tokens.
export const SURFACE = {
  slab: "#e9e2cf",
  edge: "#cdd6c6",
  centre: "#cfe3cc",
  paper: "#eef4e9",
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
