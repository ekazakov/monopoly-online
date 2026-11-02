import type { AvatarKind } from "./avatars.tsx";

export interface RailLook {
  /** CSS colour: a `--hf-pawn-*` token. Games of five and six players add two more colours. */
  color: string;
  avatar: AvatarKind;
}

// The colour index is the seat order. The figures follow the 3D token set: red terrier, blue cat,
// green penguin, gold racing car. The fifth and sixth colours have no token yet, so they carry
// their value as the fallback.
const LOOKS: readonly RailLook[] = [
  { color: "var(--hf-pawn-red)", avatar: "dog" },
  { color: "var(--hf-pawn-blue)", avatar: "cat" },
  { color: "var(--hf-pawn-green)", avatar: "penguin" },
  { color: "var(--hf-pawn-gold)", avatar: "car" },
  { color: "var(--hf-pawn-purple, #8e5fd6)", avatar: "cat" },
  { color: "var(--hf-pawn-teal, #27b3ad)", avatar: "dog" },
];

/** Look of the player at this seat order. An index past the end wraps round. */
export function railLook(colorIndex: number): RailLook {
  const n = LOOKS.length;
  return LOOKS[((Math.trunc(colorIndex) % n) + n) % n]!;
}
