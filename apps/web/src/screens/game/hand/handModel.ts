import { SQUARES, groupSquares, isProperty, rentFor } from "@monopoly/game-engine";
import type { GameState, SquareGroup } from "@monopoly/game-engine";
import type { RedactedGameState } from "@monopoly/shared";
import { currentLanguage, formatMoney, squareName } from "../../../i18n/index.ts";
import type { Translate } from "../../../i18n/index.ts";

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

export const money = (amount: number) => formatMoney(amount, currentLanguage());

// Reads only `ownership`, as `rentFor` does. The dice total matters for utilities only.
const forEngine = (state: RedactedGameState) => state as unknown as GameState;

function rentText(
  state: RedactedGameState,
  square: number,
  mortgaged: boolean,
  t: Translate,
): string {
  if (mortgaged) return t("hand.noRent");
  const info = SQUARES[square];
  if (info?.kind === "utility") {
    return t("hand.rentDice", { count: rentFor(forEngine(state), square, 1) });
  }
  return t("hand.rent", { amount: money(rentFor(forEngine(state), square, 0)) });
}

/** The properties of one seat, grouped by colour. */
export function handOf(state: RedactedGameState, seatId: string, t: Translate): HandView {
  const cards: HandCard[] = [];
  for (const [key, entry] of Object.entries(state.ownership)) {
    if (entry.ownerId !== seatId) continue;
    const square = Number(key);
    const info = SQUARES[square];
    if (!info || !isProperty(info)) continue;
    cards.push({
      square,
      name: squareName(square, t),
      group: info.group,
      kind: info.kind,
      price: info.price,
      houses: entry.houses,
      mortgaged: entry.mortgaged,
      rent: rentText(state, square, entry.mortgaged, t),
    });
  }
  cards.sort((a, b) => a.square - b.square);

  const groups: HandGroup[] = [];
  for (const group of GROUP_ORDER) {
    const inGroup = cards.filter((card) => card.group === group);
    if (inGroup.length === 0) continue;
    groups.push({
      group,
      label: t(`group.${group}`),
      color: `var(--hf-street-${group})`,
      cards: inGroup,
      complete: inGroup.length === groupSquares(group).length,
    });
  }
  return { groups, count: cards.length, value: cards.reduce((sum, c) => sum + c.price, 0) };
}

export const buildingText = (houses: number, t: Translate) =>
  houses === 0
    ? t("hand.noBuildings")
    : houses === 5
      ? t("hand.hotel")
      : t("count.houses", { count: houses });
