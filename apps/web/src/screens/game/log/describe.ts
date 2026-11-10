import { CHANCE_CARDS, CHEST_CARDS, SQUARES } from "@monopoly/game-engine";
import type { DebugChange, DeckName, GameEvent, Seat, TradeOffer } from "@monopoly/shared";

/** How a line is styled. The text always says the same thing: tone adds emphasis, never meaning. */
export type LogTone = "neutral" | "gain" | "loss" | "alert";

export type LogIconName =
  | "dice"
  | "move"
  | "coin"
  | "property"
  | "card"
  | "build"
  | "debt"
  | "jail"
  | "auction"
  | "trade"
  | "turn"
  | "end";

/** A piece of a line: plain text, or a player the view can colour. */
export type LogPart = string | { playerId: string };

export interface LogLine {
  /** The whole line as plain text, with player names resolved. */
  text: string;
  tone: LogTone;
  icon?: LogIconName;
  /** The player the line is about. The view colours its dot with this player's colour. */
  playerId: string | null;
  /** `text` split so that the view can style the player names. Joining the names gives `text`. */
  parts: readonly LogPart[];
}

export interface DescribeContext {
  seats: readonly Pick<Seat, "id" | "name">[];
}

export function playerName(ctx: DescribeContext, playerId: string): string {
  return ctx.seats.find((seat) => seat.id === playerId)?.name ?? "A player";
}

/** "$1,500". A negative amount reads "−$20". */
export function formatMoney(amount: number): string {
  return `${amount < 0 ? "−" : ""}$${Math.abs(amount).toLocaleString("en-US")}`;
}

const squareName = (square: number) => SQUARES[square]?.name ?? `square ${square}`;
const deckLabel = (deck: DeckName) => (deck === "chance" ? "Chance" : "Chest");
const cardTitle = (deck: DeckName, index: number) =>
  (deck === "chance" ? CHANCE_CARDS : CHEST_CARDS)[index]?.title ?? "a card";
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const building = (houses: number) => (houses >= 5 ? "a hotel" : "a house");

type Value = string | number | LogPart | readonly LogPart[];

const who = (playerId: string): LogPart => ({ playerId });

/** A template tag that builds the parts of a line. Adjacent text is joined. */
function parts(strings: TemplateStringsArray, ...values: Value[]): LogPart[] {
  const result: LogPart[] = [];
  const push = (part: LogPart) => {
    const last = result[result.length - 1];
    if (typeof part === "string" && typeof last === "string")
      result[result.length - 1] = last + part;
    else result.push(part);
  };
  strings.forEach((text, i) => {
    push(text);
    const value = values[i];
    if (value === undefined) return;
    if (typeof value === "number") push(String(value));
    else if (typeof value === "string" || !Array.isArray(value)) push(value as LogPart);
    else for (const part of value as readonly LogPart[]) push(part);
  });
  return result;
}

/** "A", "A and B", "A, B and C". */
function listOf(items: readonly LogPart[]): LogPart[] {
  const result: LogPart[] = [];
  items.forEach((item, i) => {
    if (i > 0) result.push(i === items.length - 1 ? " and " : ", ");
    result.push(item);
  });
  return result;
}

function offerText(offer: TradeOffer): string {
  const items = [
    ...offer.squares.map(squareName),
    ...(offer.cash > 0 ? [formatMoney(offer.cash)] : []),
    ...offer.jailCards.map((deck) => `Get Out of Jail Free (${deckLabel(deck)})`),
  ];
  return items.length > 0 ? items.join(" + ") : "nothing";
}

const reasonText = {
  tax: "tax",
  rent: "rent",
  card: "a card",
  fine: "a fine",
} as const;

function creditorParts(creditor: { type: "bank" } | { type: "player"; id: string }): LogPart[] {
  return creditor.type === "bank" ? ["the bank"] : [who(creditor.id)];
}

function assetsText(event: Extract<GameEvent, { type: "AssetsTransferred" }>): string {
  const cash = event.cash.reduce((sum, share) => sum + share.amount, 0);
  const items = [
    ...(event.squares.length > 0 ? [plural(event.squares.length, "property", "properties")] : []),
    ...(event.jailCards.length > 0
      ? [plural(event.jailCards.length, "Get Out of Jail Free card", "Get Out of Jail Free cards")]
      : []),
    ...(cash > 0 ? [formatMoney(cash)] : []),
  ];
  return items.length > 0 ? items.join(", ") : "nothing";
}

/**
 * The text of one engine event, for the game log (spec 4.1). Pure: the same event and seats give
 * the same line. The `never` check at the end makes a new event type fail the type check here.
 */
function debugParts(change: DebugChange): LogPart[] {
  switch (change.kind) {
    case "cash":
      return parts`${who(change.targetId)}'s cash set to ${formatMoney(change.cash)}.`;
    case "position":
      return parts`${who(change.targetId)}'s token put on ${squareName(change.square)}.`;
    case "deed": {
      if (change.ownerId === null) return parts`${squareName(change.square)} returned to the bank.`;
      const extras = [
        ...(change.houses > 0
          ? [change.houses === 5 ? "a hotel" : plural(change.houses, "house", "houses")]
          : []),
        ...(change.mortgaged ? ["mortgaged"] : []),
      ];
      const tail = extras.length > 0 ? `, ${extras.join(", ")}` : "";
      return parts`${squareName(change.square)} given to ${who(change.ownerId)}${tail}.`;
    }
    case "top_card":
      // This tells every device the next card. That is acceptable in debug mode.
      return parts`"${cardTitle(change.deck, change.cardIndex)}" put on top of ${deckLabel(change.deck)}.`;
    case "next_dice":
      return parts`next roll set to ${String(change.dice[0])} and ${String(change.dice[1])}.`;
  }
}

export function describeEvent(event: GameEvent, ctx: DescribeContext): LogLine {
  const line = (
    tone: LogTone,
    icon: LogIconName | undefined,
    playerId: string | null,
    content: LogPart[],
  ): LogLine => ({
    text: content
      .map((part) => (typeof part === "string" ? part : playerName(ctx, part.playerId)))
      .join(""),
    tone,
    ...(icon ? { icon } : {}),
    playerId,
    parts: content,
  });

  switch (event.type) {
    case "DiceRolled": {
      const [a, b] = event.dice;
      return line(
        "neutral",
        "dice",
        event.playerId,
        parts`${who(event.playerId)} rolled ${a} and ${b}${a === b ? " (doubles)" : ""}.`,
      );
    }
    case "PlayerMoved":
      return line(
        "neutral",
        "move",
        event.playerId,
        parts`${who(event.playerId)} moved to ${squareName(event.to)}.`,
      );
    case "PassedGo":
      return line(
        "gain",
        "coin",
        event.playerId,
        parts`${who(event.playerId)} collected ${formatMoney(event.amount)} passing Start.`,
      );
    case "PropertyBought":
      return line(
        "neutral",
        "property",
        event.playerId,
        parts`${who(event.playerId)} bought ${squareName(event.square)} for ${formatMoney(event.price)}.`,
      );
    case "RentPaid":
      return line(
        "loss",
        "coin",
        event.payerId,
        parts`${who(event.payerId)} paid ${formatMoney(event.amount)} rent to ${who(event.ownerId)}.`,
      );
    case "TaxPaid":
      return line(
        "loss",
        "coin",
        event.playerId,
        parts`${who(event.playerId)} paid ${formatMoney(event.amount)} ${squareName(event.square)}.`,
      );
    case "CardDrawn":
      return line(
        "neutral",
        "card",
        event.playerId,
        parts`${who(event.playerId)} drew a ${deckLabel(event.deck)} card: ${cardTitle(event.deck, event.cardIndex)}.`,
      );
    case "CashChanged":
      return event.amount < 0
        ? line(
            "loss",
            "coin",
            event.playerId,
            parts`${who(event.playerId)} paid ${formatMoney(-event.amount)}.`,
          )
        : line(
            "gain",
            "coin",
            event.playerId,
            parts`${who(event.playerId)} collected ${formatMoney(event.amount)}.`,
          );
    case "BuildingBuilt":
      return line(
        "neutral",
        "build",
        event.playerId,
        parts`${who(event.playerId)} built ${building(event.houses)} on ${squareName(event.square)} for ${formatMoney(event.cost)}.`,
      );
    case "BuildingSold":
      // `houses` counts what is left. A hotel sale leaves 4 houses.
      return line(
        "gain",
        "build",
        event.playerId,
        parts`${who(event.playerId)} sold ${building(event.houses + 1)} on ${squareName(event.square)} for ${formatMoney(event.refund)}.`,
      );
    case "PropertyMortgaged":
      return line(
        "gain",
        "property",
        event.playerId,
        parts`${who(event.playerId)} mortgaged ${squareName(event.square)} for ${formatMoney(event.amount)}.`,
      );
    case "PropertyUnmortgaged":
      return line(
        "loss",
        "property",
        event.playerId,
        parts`${who(event.playerId)} unmortgaged ${squareName(event.square)} for ${formatMoney(event.cost)}.`,
      );
    case "DebtIncurred":
      return line(
        "alert",
        "debt",
        event.debtorId,
        parts`${who(event.debtorId)} owes ${creditorParts(event.creditor)} ${formatMoney(event.amount)} for ${reasonText[event.reason]}.`,
      );
    case "DebtPaid":
      return line(
        "loss",
        "debt",
        event.debtorId,
        parts`${who(event.debtorId)} paid a ${formatMoney(event.amount)} debt to ${creditorParts(event.creditor)}.`,
      );
    case "BankruptcyDeclared":
      return line(
        "alert",
        "end",
        event.playerId,
        event.creditorIds.length > 0
          ? parts`${who(event.playerId)} went bankrupt to ${listOf(event.creditorIds.map(who))}.`
          : parts`${who(event.playerId)} went bankrupt to the bank.`,
      );
    case "AssetsTransferred":
      return line(
        "alert",
        "property",
        event.fromId,
        parts`${who(event.fromId)}'s assets went to ${event.toId === null ? "the bank" : who(event.toId)}: ${assetsText(event)}.`,
      );
    case "PlayerResigned":
      return line("alert", "end", event.playerId, parts`${who(event.playerId)} resigned.`);
    case "PlayerEliminated":
      return line(
        "alert",
        "end",
        event.playerId,
        parts`${who(event.playerId)} is out of the game.`,
      );
    case "AuctionStarted":
      return line(
        "neutral",
        "auction",
        null,
        parts`Auction for ${squareName(event.square)} started. Bidders: ${listOf(event.bidderIds.map(who))}.`,
      );
    case "BidPlaced":
      return line(
        "neutral",
        "auction",
        event.playerId,
        parts`${who(event.playerId)} bid ${formatMoney(event.amount)}.`,
      );
    case "BidPassed":
      return line(
        "neutral",
        "auction",
        event.playerId,
        parts`${who(event.playerId)} passed${event.auto ? " automatically" : ""}.`,
      );
    case "AuctionEnded":
      return event.winnerId === null
        ? line(
            "neutral",
            "auction",
            null,
            parts`No one bid on ${squareName(event.square)}. It stays unowned.`,
          )
        : line(
            "neutral",
            "auction",
            event.winnerId,
            parts`${who(event.winnerId)} won ${squareName(event.square)} at auction for ${formatMoney(event.price)}.`,
          );
    case "TradeProposed":
      return line(
        "neutral",
        "trade",
        event.fromId,
        parts`${who(event.fromId)} proposed a trade to ${who(event.toId)}: gives ${offerText(event.give)}, gets ${offerText(event.get)}.`,
      );
    case "TradeAccepted":
      return line(
        "gain",
        "trade",
        event.toId,
        parts`${who(event.toId)} accepted the trade from ${who(event.fromId)}.`,
      );
    case "TradeRejected":
      return line(
        "neutral",
        "trade",
        event.toId,
        parts`${who(event.toId)} rejected the trade from ${who(event.fromId)}.`,
      );
    case "TradeCancelled":
      return line(
        "neutral",
        "trade",
        event.fromId,
        parts`${who(event.fromId)} cancelled the trade offer to ${who(event.toId)}.`,
      );
    case "FinePaid":
      return line(
        "loss",
        "jail",
        event.playerId,
        parts`${who(event.playerId)} paid the ${formatMoney(event.amount)} jail fine.`,
      );
    case "SentToJail":
      return line("alert", "jail", event.playerId, parts`${who(event.playerId)} was sent to jail.`);
    case "LeftJail":
      return line("gain", "jail", event.playerId, parts`${who(event.playerId)} left jail.`);
    case "TurnEnded":
      return line(
        "neutral",
        "turn",
        event.playerId,
        parts`${who(event.playerId)} ended the turn. ${who(event.nextPlayerId)} is next.`,
      );
    case "GameEnded":
      return line("gain", "end", event.winnerId, parts`${who(event.winnerId)} won the game!`);
    case "StateEdited":
      return line("alert", undefined, event.playerId, [
        ...parts`${who(event.playerId)} (debug): `,
        ...debugParts(event.change),
      ]);
    default: {
      const unhandled: never = event;
      return unhandled;
    }
  }
}
