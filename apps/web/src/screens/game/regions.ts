import type { MessageKey } from "../../i18n/index.ts";
// Slot names of the game layout (spec 3.1). Tests and the tasks that fill the slots use these keys.
export const GAME_REGIONS = ["rail", "log", "board", "centre", "hand", "menu"] as const;

export type GameRegion = (typeof GAME_REGIONS)[number];

// Accessible names of the region landmarks. The log and hand content add their own roles inside.
export const GAME_REGION_LABELS: Record<GameRegion, MessageKey> = {
  rail: "region.rail",
  log: "region.log",
  board: "region.board",
  centre: "region.centre",
  hand: "region.hand",
  menu: "region.menu",
};

// Visual order (spec 6, keyboard order): log toggle, Menu, players, turn actions, hand.
// The board is a backdrop with no controls of its own, so it comes first in the DOM.
export const GAME_TAB_ORDER: readonly GameRegion[] = [
  "board",
  "log",
  "menu",
  "rail",
  "centre",
  "hand",
];
