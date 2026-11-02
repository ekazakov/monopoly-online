import { BOARD_SIZE, CHANCE_CARDS, CHEST_CARDS, SQUARES } from "@monopoly/game-engine";
import type { Card, CardEffect } from "@monopoly/game-engine";
import type { DeckName } from "@monopoly/shared";
import { formatMoney } from "../../turn/format.ts";

export const DECK_LABELS: Record<DeckName, string> = {
  chance: "Chance",
  chest: "Community Chest",
};

export function cardAt(deck: DeckName, cardIndex: number): Card | undefined {
  return (deck === "chance" ? CHANCE_CARDS : CHEST_CARDS)[cardIndex];
}

/** What a card does, in the wording of the rules reference, Appendix C. */
export function effectText(effect: CardEffect): string {
  switch (effect.type) {
    case "move_to": {
      const name = SQUARES[effect.square]?.name ?? "the square";
      if (effect.square === 0) return `Advance to ${name}. Collect ${formatMoney(200)}.`;
      // The last square is ahead of every start, so the token never passes Start on the way.
      if (effect.square === BOARD_SIZE - 1) return `Advance to ${name}.`;
      return `Advance to ${name}. Collect ${formatMoney(200)} if you pass Start.`;
    }
    case "move_nearest":
      return effect.target === "station"
        ? "Advance to the nearest Station. If it is unowned, you may buy it. If it is owned, pay the owner double the normal rent."
        : "Advance to the nearest Utility. If it is unowned, you may buy it. If it is owned, roll the dice and pay the owner 10 × the total.";
    case "move_back":
      return `Move back ${effect.steps} ${effect.steps === 1 ? "square" : "squares"}.`;
    case "collect":
      return `Collect ${formatMoney(effect.amount)}.`;
    case "pay":
      return `Pay the bank ${formatMoney(effect.amount)}.`;
    case "pay_each_player":
      return `Pay each other player ${formatMoney(effect.amount)}.`;
    case "collect_from_each_player":
      return `Collect ${formatMoney(effect.amount)} from every other player.`;
    case "repairs":
      return `Pay ${formatMoney(effect.perHouse)} per house and ${formatMoney(effect.perHotel)} per hotel you own.`;
    case "go_to_jail":
      return `Go directly to Jail. Do not pass Start, do not collect ${formatMoney(200)}.`;
    case "jail_free":
      return "Keep it until needed, or trade it. It returns to the bottom of the deck when used.";
  }
}
