import { SQUARES, groupSquares, isProperty, rentFor } from "@monopoly/game-engine";
import type { GameState, SquareGroup } from "@monopoly/game-engine";
import type { RedactedGameState } from "@monopoly/shared";
import { GROUP_LABELS } from "./propertyActions.ts";

/** Stack order in the hand (spec 4.6): the colour groups in board order, then stations, utilities. */
export const GROUP_ORDER: readonly SquareGroup[] = [
  "brown",
  "sky",
  "pink",
  "orange",
  "red",
  "yellow",
  "green",
  "navy",
  "station",
  "utility",
];

export interface HandCard {
  square: number;
  name: string;
  group: SquareGroup;
  kind: "street" | "station" | "utility";
  price: number;
  /** 0 to 4 houses, 5 is a hotel. */
  houses: number;
  mortgaged: boolean;
  /** "Rent $30", "4× dice" or "No rent". */
  rent: string;
}

export interface HandGroup {
  group: SquareGroup;
  label: string;
  /** A CSS colour from the street tokens. */
  color: string;
  cards: HandCard[];
  /** The seat owns every property of the group. */
  complete: boolean;
}

export interface HandView {
  groups: HandGroup[];
  count: number;
  /** The purchase prices of the properties. */
  value: number;
}

export const money = (amount: number) => `$${amount.toLocaleString("en-US")}`;

// Reads only `ownership`, as `rentFor` does. The dice total matters for utilities only.
const forEngine = (state: RedactedGameState) => state as unknown as GameState;

function rentText(state: RedactedGameState, square: number, mortgaged: boolean): string {
  if (mortgaged) return "No rent";
  const info = SQUARES[square];
  if (info?.kind === "utility") return `${rentFor(forEngine(state), square, 1)}× dice`;
  return `Rent ${money(rentFor(forEngine(state), square, 0))}`;
}

/** The properties of one seat, grouped by colour. */
export function handOf(state: RedactedGameState, seatId: string): HandView {
  const cards: HandCard[] = [];
  for (const [key, entry] of Object.entries(state.ownership)) {
    if (entry.ownerId !== seatId) continue;
    const square = Number(key);
    const info = SQUARES[square];
    if (!info || !isProperty(info)) continue;
    cards.push({
      square,
      name: info.name,
      group: info.group,
      kind: info.kind,
      price: info.price,
      houses: entry.houses,
      mortgaged: entry.mortgaged,
      rent: rentText(state, square, entry.mortgaged),
    });
  }
  cards.sort((a, b) => a.square - b.square);

  const groups: HandGroup[] = [];
  for (const group of GROUP_ORDER) {
    const inGroup = cards.filter((card) => card.group === group);
    if (inGroup.length === 0) continue;
    groups.push({
      group,
      label: GROUP_LABELS[group],
      color: `var(--hf-street-${group})`,
      cards: inGroup,
      complete: inGroup.length === groupSquares(group).length,
    });
  }
  return { groups, count: cards.length, value: cards.reduce((sum, c) => sum + c.price, 0) };
}

export const buildingText = (houses: number) =>
  houses === 0
    ? "no buildings"
    : houses === 5
      ? "hotel"
      : `${houses} ${houses === 1 ? "house" : "houses"}`;
