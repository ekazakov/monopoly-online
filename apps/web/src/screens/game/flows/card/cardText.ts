import { BOARD_SIZE, CHANCE_CARDS, CHEST_CARDS, SQUARES } from "@monopoly/game-engine";
import type { Card, CardEffect } from "@monopoly/game-engine";
import type { DeckName } from "@monopoly/shared";
import { squareName } from "../../../../i18n/index.ts";
import type { Translate } from "../../../../i18n/index.ts";
import { formatMoney } from "../../turn/format.ts";

/** English deck names, for the debug panel. The game screen uses `deckLabel`. */
export const DECK_LABELS: Record<DeckName, string> = {
  chance: "Chance",
  chest: "Community Chest",
};

export const deckLabel = (deck: DeckName, t: Translate): string => t(`card.deck.${deck}`);

export function cardAt(deck: DeckName, cardIndex: number): Card | undefined {
  return (deck === "chance" ? CHANCE_CARDS : CHEST_CARDS)[cardIndex];
}

/** What a card does, in the wording of the rules reference, Appendix C. */
export function effectText(effect: CardEffect, t: Translate): string {
  switch (effect.type) {
    case "move_to": {
      const name = SQUARES[effect.square] ? squareName(effect.square, t) : t("effect.theSquare");
      if (effect.square === 0) return t("effect.advanceStart", { name, amount: formatMoney(200) });
      // The last square is ahead of every start, so the token never passes Start on the way.
      if (effect.square === BOARD_SIZE - 1) return t("effect.advance", { name });
      return t("effect.advancePass", { name, amount: formatMoney(200) });
    }
    case "move_nearest":
      return effect.target === "station" ? t("effect.nearestStation") : t("effect.nearestUtility");
    case "move_back":
      return t("effect.moveBack", { count: effect.steps });
    case "collect":
      return t("effect.collect", { amount: formatMoney(effect.amount) });
    case "pay":
      return t("effect.pay", { amount: formatMoney(effect.amount) });
    case "pay_each_player":
      return t("effect.payEach", { amount: formatMoney(effect.amount) });
    case "collect_from_each_player":
      return t("effect.collectEach", { amount: formatMoney(effect.amount) });
    case "repairs":
      return t("effect.repairs", {
        house: formatMoney(effect.perHouse),
        hotel: formatMoney(effect.perHotel),
      });
    case "go_to_jail":
      return t("effect.goJail", { amount: formatMoney(200) });
    case "jail_free":
      return t("effect.jailFree");
  }
}
