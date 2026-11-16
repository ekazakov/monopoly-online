import { SQUARES } from "@monopoly/game-engine";
import type { SquareGroup } from "@monopoly/game-engine";

// The names of the board stay English in every language, so that players with different
// languages see the same names. Only the descriptions and the UI text are translated.

/** The name of a square, by its number on the board. */
export function squareName(square: number): string {
  return SQUARES[square]?.name ?? `square ${square}`;
}

const GROUP_NAMES: Record<SquareGroup, string> = {
  brown: "Brown",
  sky: "Sky",
  pink: "Pink",
  orange: "Orange",
  red: "Red",
  yellow: "Yellow",
  green: "Green",
  navy: "Navy",
  station: "Stations",
  utility: "Utilities",
};

/** The name of a color group, or of the stations or the utilities. */
export function groupName(group: SquareGroup): string {
  return GROUP_NAMES[group];
}

/** The fixed text on the board tiles, the corners and the card backs. */
export const BOARD_TEXT = {
  pay: (amount: string) => `Pay ${amount}`,
  collect: "COLLECT $200",
  salary: "SALARY AS YOU PASS",
  start: "START",
  inJail: "IN JAIL",
  visiting: "JUST VISITING",
  free: "FREE",
  parking: "PARKING",
  goTo: "GO TO",
  jail: "JAIL",
  chance: "CHANCE",
  chest: "CHEST",
} as const;
