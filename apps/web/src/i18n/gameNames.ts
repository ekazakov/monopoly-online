import { SQUARES } from "@monopoly/game-engine";
import { hasMessage } from "./translate.ts";
import type { MessageKey, Translate } from "./translate.ts";

/** The card titles of the engine decks. The title is the identity of a card: the cards have no id. */
const CARD_KEYS: Record<string, MessageKey> = {
  "Sail home": "card.sailHome",
  "Climb the hill": "card.climbTheHill",
  "Pier inspection": "card.pierInspection",
  "Anchor day": "card.anchorDay",
  "Next stop, a Station": "card.nextStopAStation",
  "Nearest utility": "card.nearestUtility",
  "Trip to East Station": "card.tripToEastStation",
  Dividend: "card.dividend",
  "Loan matures": "card.loanMatures",
  "Back three": "card.backThree",
  "Marina fine": "card.marinaFine",
  "Dock repairs": "card.dockRepairs",
  "Harbour master's party": "card.harbourMastersParty",
  "Go to Jail": "card.goToJail",
  "Get Out of Jail Free": "card.getOutOfJailFree",
  "Home port": "card.homePort",
  "Bank error": "card.bankError",
  "Doctor's bill": "card.doctorsBill",
  "Cargo sale": "card.cargoSale",
  "Fund matures": "card.fundMatures",
  "Tax refund": "card.taxRefund",
  Festival: "card.festival",
  "Insurance matures": "card.insuranceMatures",
  "Hospital fees": "card.hospitalFees",
  "School fees": "card.schoolFees",
  "Consulting fee": "card.consultingFee",
  "Street repairs": "card.streetRepairs",
  "Regatta prize": "card.regattaPrize",
  Inheritance: "card.inheritance",
};

/** The name of a square, by its number on the board. An unknown square keeps the engine name. */
export function squareName(square: number, t: Translate): string {
  const key = `square.${square}`;
  return hasMessage(key) ? t(key) : (SQUARES[square]?.name ?? t("square.unknown", { square }));
}

/** The name of a square from its engine object, for the code that has no square number. */
export function squareInfoName(info: { name: string }, t: Translate): string {
  const index = SQUARES.findIndex((square) => square === info);
  return index >= 0 ? squareName(index, t) : info.name;
}

/** The title of a card of the Chance or the Chest deck. An unknown title shows as it is. */
export function cardTitle(title: string, t: Translate): string {
  const key = CARD_KEYS[title];
  return key ? t(key) : title;
}
