import { CHANCE_CARDS, CHEST_CARDS, SQUARES } from "@monopoly/game-engine";
import type { DebugChange, DeckName, GameEvent, Seat, TradeOffer } from "@monopoly/shared";
import {
  cardTitle as cardTitleIn,
  currentLanguage,
  formatMoney as formatMoneyIn,
  joinNames,
  squareName as squareNameIn,
} from "../../../i18n/index.ts";
import type { MessageKey, Params, Translate } from "../../../i18n/index.ts";

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

export function playerName(ctx: DescribeContext, playerId: string, t: Translate): string {
  return ctx.seats.find((seat) => seat.id === playerId)?.name ?? t("card.aPlayer");
}

/** "$1,500". A negative amount reads "−$20". */
export function formatMoney(amount: number): string {
  return formatMoneyIn(amount, currentLanguage());
}

// The debug lines (StateEdited) stay in English: the debug panel is a developer tool.
const squareName = (square: number) => SQUARES[square]?.name ?? `square ${square}`;
const deckLabel = (deck: DeckName) => (deck === "chance" ? "Chance" : "Chest");
const cardTitle = (deck: DeckName, index: number) =>
  (deck === "chance" ? CHANCE_CARDS : CHEST_CARDS)[index]?.title ?? "a card";
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

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

type Param = string | number | LogPart | readonly LogPart[];

/**
 * The parts of a line from a catalogue text. A player in `params` stays a part, so the view can
 * style the name: the player is marked in the text, and the marks split the translated text again.
 */
function say(t: Translate, key: MessageKey, params: Record<string, Param> = {}): LogPart[] {
  const refs: LogPart[] = [];
  const mark = (part: LogPart) =>
    typeof part === "string" ? part : `\uE000${refs.push(part) - 1}\uE000`;
  const flat: Params = {};
  for (const [name, value] of Object.entries(params)) {
    if (typeof value === "string" || typeof value === "number") flat[name] = value;
    else if (Array.isArray(value))
      flat[name] = joinNames((value as readonly LogPart[]).map(mark), t);
    else flat[name] = mark(value as LogPart);
  }
  const result: LogPart[] = [];
  t(key, flat)
    .split(/\uE000(\d+)\uE000/)
    .forEach((piece, i) => {
      if (i % 2 === 1) result.push(refs[Number(piece)]!);
      else if (piece !== "") result.push(piece);
    });
  return result;
}

const deckName = (deck: DeckName, t: Translate) => t(`deck.${deck}`);
const buildingName = (houses: number, t: Translate) => t(houses >= 5 ? "log.aHotel" : "log.aHouse");

function offerText(offer: TradeOffer, t: Translate): string {
  const items = [
    ...offer.squares.map((square) => squareNameIn(square, t)),
    ...(offer.cash > 0 ? [formatMoney(offer.cash)] : []),
    ...offer.jailCards.map((deck) => t("trade.jailCard", { deck: deckName(deck, t) })),
  ];
  return items.length > 0 ? items.join(" + ") : t("trade.nothing");
}

function creditorOf(
  creditor: { type: "bank" } | { type: "player"; id: string },
  t: Translate,
): LogPart {
  return creditor.type === "bank" ? t("debt.theBank") : who(creditor.id);
}

function assetsText(
  event: Extract<GameEvent, { type: "AssetsTransferred" }>,
  t: Translate,
): string {
  const cash = event.cash.reduce((sum, share) => sum + share.amount, 0);
  const items = [
    ...(event.squares.length > 0 ? [t("count.properties", { count: event.squares.length })] : []),
    ...(event.jailCards.length > 0
      ? [t("count.jailCardsFree", { count: event.jailCards.length })]
      : []),
    ...(cash > 0 ? [formatMoney(cash)] : []),
  ];
  return items.length > 0 ? items.join(", ") : t("trade.nothing");
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

export function describeEvent(event: GameEvent, ctx: DescribeContext, t: Translate): LogLine {
  const line = (
    tone: LogTone,
    icon: LogIconName | undefined,
    playerId: string | null,
    content: LogPart[],
  ): LogLine => ({
    text: content
      .map((part) => (typeof part === "string" ? part : playerName(ctx, part.playerId, t)))
      .join(""),
    tone,
    ...(icon ? { icon } : {}),
    playerId,
    parts: content,
  });
  const sq = (square: number) => squareNameIn(square, t);

  switch (event.type) {
    case "DiceRolled": {
      const [a, b] = event.dice;
      return line(
        "neutral",
        "dice",
        event.playerId,
        say(t, a === b ? "log.diceDoubles" : "log.dice", { who: who(event.playerId), a, b }),
      );
    }
    case "PlayerMoved":
      return line(
        "neutral",
        "move",
        event.playerId,
        say(t, "log.moved", { who: who(event.playerId), square: sq(event.to) }),
      );
    case "PassedGo":
      return line(
        "gain",
        "coin",
        event.playerId,
        say(t, "log.passedGo", { who: who(event.playerId), amount: formatMoney(event.amount) }),
      );
    case "PropertyBought":
      return line(
        "neutral",
        "property",
        event.playerId,
        say(t, "log.bought", {
          who: who(event.playerId),
          square: sq(event.square),
          price: formatMoney(event.price),
        }),
      );
    case "RentPaid":
      return line(
        "loss",
        "coin",
        event.payerId,
        say(t, "log.rent", {
          who: who(event.payerId),
          amount: formatMoney(event.amount),
          owner: who(event.ownerId),
        }),
      );
    case "TaxPaid":
      return line(
        "loss",
        "coin",
        event.playerId,
        say(t, "log.tax", {
          who: who(event.playerId),
          amount: formatMoney(event.amount),
          square: sq(event.square),
        }),
      );
    case "CardDrawn":
      return line(
        "neutral",
        "card",
        event.playerId,
        say(t, "log.card", {
          who: who(event.playerId),
          deck: deckName(event.deck, t),
          title:
            cardTitleIn(
              (event.deck === "chance" ? CHANCE_CARDS : CHEST_CARDS)[event.cardIndex]?.title ?? "",
              t,
            ) || t("log.aCard"),
        }),
      );
    case "CashChanged":
      return event.amount < 0
        ? line(
            "loss",
            "coin",
            event.playerId,
            say(t, "log.paid", { who: who(event.playerId), amount: formatMoney(-event.amount) }),
          )
        : line(
            "gain",
            "coin",
            event.playerId,
            say(t, "log.collected", {
              who: who(event.playerId),
              amount: formatMoney(event.amount),
            }),
          );
    case "BuildingBuilt":
      return line(
        "neutral",
        "build",
        event.playerId,
        say(t, "log.built", {
          who: who(event.playerId),
          building: buildingName(event.houses, t),
          square: sq(event.square),
          cost: formatMoney(event.cost),
        }),
      );
    case "BuildingSold":
      return line(
        "gain",
        "build",
        event.playerId,
        say(t, "log.soldBuilding", {
          who: who(event.playerId),
          building: buildingName(event.houses + 1, t),
          square: sq(event.square),
          refund: formatMoney(event.refund),
        }),
      );
    case "PropertyMortgaged":
      return line(
        "gain",
        "property",
        event.playerId,
        say(t, "log.mortgaged", {
          who: who(event.playerId),
          square: sq(event.square),
          amount: formatMoney(event.amount),
        }),
      );
    case "PropertyUnmortgaged":
      return line(
        "loss",
        "property",
        event.playerId,
        say(t, "log.unmortgaged", {
          who: who(event.playerId),
          square: sq(event.square),
          cost: formatMoney(event.cost),
        }),
      );
    case "DebtIncurred":
      return line(
        "alert",
        "debt",
        event.debtorId,
        say(t, "log.owes", {
          who: who(event.debtorId),
          creditor: creditorOf(event.creditor, t),
          amount: formatMoney(event.amount),
          reason: t(`log.reason.${event.reason}`),
        }),
      );
    case "DebtPaid":
      return line(
        "loss",
        "debt",
        event.debtorId,
        say(t, "log.debtPaid", {
          who: who(event.debtorId),
          amount: formatMoney(event.amount),
          creditor: creditorOf(event.creditor, t),
        }),
      );
    case "BankruptcyDeclared":
      return line(
        "alert",
        "end",
        event.playerId,
        event.creditorIds.length > 0
          ? say(t, "log.bankrupt", { who: who(event.playerId), to: event.creditorIds.map(who) })
          : say(t, "log.bankruptBank", { who: who(event.playerId) }),
      );
    case "AssetsTransferred":
      return line(
        "alert",
        "property",
        event.fromId,
        say(t, "log.assets", {
          who: who(event.fromId),
          to: event.toId === null ? t("debt.theBank") : who(event.toId),
          assets: assetsText(event, t),
        }),
      );
    case "PlayerResigned":
      return line(
        "alert",
        "end",
        event.playerId,
        say(t, "log.resigned", { who: who(event.playerId) }),
      );
    case "PlayerEliminated":
      return line("alert", "end", event.playerId, say(t, "log.out", { who: who(event.playerId) }));
    case "AuctionStarted":
      return line(
        "neutral",
        "auction",
        null,
        say(t, "log.auctionStarted", {
          square: sq(event.square),
          bidders: event.bidderIds.map(who),
        }),
      );
    case "BidPlaced":
      return line(
        "neutral",
        "auction",
        event.playerId,
        say(t, "log.bid", { who: who(event.playerId), amount: formatMoney(event.amount) }),
      );
    case "BidPassed":
      return line(
        "neutral",
        "auction",
        event.playerId,
        say(t, event.auto ? "log.passedAuto" : "log.passed", { who: who(event.playerId) }),
      );
    case "AuctionEnded":
      return event.winnerId === null
        ? line("neutral", "auction", null, say(t, "log.noBids", { square: sq(event.square) }))
        : line(
            "neutral",
            "auction",
            event.winnerId,
            say(t, "log.won", {
              who: who(event.winnerId),
              square: sq(event.square),
              price: formatMoney(event.price),
            }),
          );
    case "TradeProposed":
      return line(
        "neutral",
        "trade",
        event.fromId,
        say(t, "log.tradeProposed", {
          from: who(event.fromId),
          to: who(event.toId),
          give: offerText(event.give, t),
          get: offerText(event.get, t),
        }),
      );
    case "TradeAccepted":
      return line(
        "gain",
        "trade",
        event.toId,
        say(t, "log.tradeAccepted", { to: who(event.toId), from: who(event.fromId) }),
      );
    case "TradeRejected":
      return line(
        "neutral",
        "trade",
        event.toId,
        say(t, "log.tradeRejected", { to: who(event.toId), from: who(event.fromId) }),
      );
    case "TradeCancelled":
      return line(
        "neutral",
        "trade",
        event.fromId,
        say(t, "log.tradeCancelled", { from: who(event.fromId), to: who(event.toId) }),
      );
    case "FinePaid":
      return line(
        "loss",
        "jail",
        event.playerId,
        say(t, "log.fine", { who: who(event.playerId), amount: formatMoney(event.amount) }),
      );
    case "SentToJail":
      return line(
        "alert",
        "jail",
        event.playerId,
        say(t, "log.sentToJail", { who: who(event.playerId) }),
      );
    case "LeftJail":
      return line(
        "gain",
        "jail",
        event.playerId,
        say(t, "log.leftJail", { who: who(event.playerId) }),
      );
    case "TurnEnded":
      return line(
        "neutral",
        "turn",
        event.playerId,
        say(t, "log.turnEnded", { who: who(event.playerId), next: who(event.nextPlayerId) }),
      );
    case "GameEnded":
      return line(
        "gain",
        "end",
        event.winnerId,
        say(t, "log.wonGame", { who: who(event.winnerId) }),
      );
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
