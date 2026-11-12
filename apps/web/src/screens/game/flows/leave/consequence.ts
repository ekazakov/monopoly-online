import type { Translate } from "../../../../i18n/index.ts";

/**
 * What resigning does (spec 8.7 and the design board Dialogs, Leave game). The properties go to
 * the player the resigner owes, or else to the bank for auction. With two active players
 * the other one wins, so the game ends.
 */
export function consequenceText(name: string | null, activePlayers: number, t: Translate): string {
  const who = name ?? t("menu.chosenPlayer");
  const rest = activePlayers <= 2 ? t("menu.resign.ends") : t("menu.resign.goesOn");
  return t("menu.resign.consequence", { name: who, rest });
}
