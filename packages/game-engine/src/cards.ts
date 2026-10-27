export type CardEffect =
  | { type: "move_to"; square: number }
  | { type: "move_nearest"; target: "station" | "utility" }
  | { type: "move_back"; steps: number }
  | { type: "collect"; amount: number }
  | { type: "pay"; amount: number }
  | { type: "pay_each_player"; amount: number }
  | { type: "collect_from_each_player"; amount: number }
  | { type: "repairs"; perHouse: number; perHotel: number }
  | { type: "go_to_jail" }
  | { type: "jail_free" };

export interface Card {
  title: string;
  effect: CardEffect;
}

/** Data from the rules reference, Appendix C. Square numbers refer to Appendix A. */
export const CHANCE_CARDS: readonly Card[] = [
  { title: "Sail home", effect: { type: "move_to", square: 0 } },
  { title: "Climb the hill", effect: { type: "move_to", square: 21 } },
  { title: "Pier inspection", effect: { type: "move_to", square: 39 } },
  { title: "Anchor day", effect: { type: "move_to", square: 11 } },
  { title: "Next stop, a Station", effect: { type: "move_nearest", target: "station" } },
  { title: "Next stop, a Station", effect: { type: "move_nearest", target: "station" } },
  { title: "Nearest utility", effect: { type: "move_nearest", target: "utility" } },
  { title: "Trip to East Station", effect: { type: "move_to", square: 15 } },
  { title: "Dividend", effect: { type: "collect", amount: 50 } },
  { title: "Loan matures", effect: { type: "collect", amount: 150 } },
  { title: "Back three", effect: { type: "move_back", steps: 3 } },
  { title: "Marina fine", effect: { type: "pay", amount: 15 } },
  { title: "Dock repairs", effect: { type: "repairs", perHouse: 25, perHotel: 100 } },
  { title: "Harbour master's party", effect: { type: "pay_each_player", amount: 50 } },
  { title: "Go to Jail", effect: { type: "go_to_jail" } },
  { title: "Get Out of Jail Free", effect: { type: "jail_free" } },
];

export const CHEST_CARDS: readonly Card[] = [
  { title: "Home port", effect: { type: "move_to", square: 0 } },
  { title: "Bank error", effect: { type: "collect", amount: 200 } },
  { title: "Doctor's bill", effect: { type: "pay", amount: 50 } },
  { title: "Cargo sale", effect: { type: "collect", amount: 50 } },
  { title: "Fund matures", effect: { type: "collect", amount: 100 } },
  { title: "Tax refund", effect: { type: "collect", amount: 20 } },
  { title: "Festival", effect: { type: "collect_from_each_player", amount: 10 } },
  { title: "Insurance matures", effect: { type: "collect", amount: 100 } },
  { title: "Hospital fees", effect: { type: "pay", amount: 100 } },
  { title: "School fees", effect: { type: "pay", amount: 50 } },
  { title: "Consulting fee", effect: { type: "collect", amount: 25 } },
  { title: "Street repairs", effect: { type: "repairs", perHouse: 40, perHotel: 115 } },
  { title: "Regatta prize", effect: { type: "collect", amount: 10 } },
  { title: "Inheritance", effect: { type: "collect", amount: 100 } },
  { title: "Go to Jail", effect: { type: "go_to_jail" } },
  { title: "Get Out of Jail Free", effect: { type: "jail_free" } },
];
