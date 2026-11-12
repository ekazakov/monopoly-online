import type { GameEvent } from "@monopoly/shared";

// The sound cues of the game and the events that play them. Pure, so the map has unit tests. The
// dice and token cues come from the motion steps (see `useGameSounds`). The coin ring comes from
// the change of each balance (`moneyCues`). The sad coin cue is only for a tax and for a card that
// takes money, so it is in this map.

export const CUE_NAMES = [
  "dice-shake",
  "dice-land",
  "hop",
  "land",
  "whoosh",
  "jail",
  "coin-in",
  "coin-out",
  "stamp",
  "build",
  "unbuild",
  "paper",
  "card",
  "bell",
  "gavel",
  "bid",
  "trade-offer",
  "trade-yes",
  "trade-no",
  "bankrupt",
  "win",
  "end",
] as const;

export type CueName = (typeof CUE_NAMES)[number];

/** One sound to play. `gain` scales the effects volume. `rate` changes the pitch and the speed. */
export interface Cue {
  name: CueName;
  gain: number;
  rate?: number;
}

/** The file of each cue, under `public/`. */
export function cueUrl(name: CueName): string {
  return `/sounds/${name}.mp3`;
}

/** Cues of the other players are quieter, so the cues of this device stand out. */
export const OTHER_GAIN = 0.55;

export interface CueOptions {
  /** Indexes of events that already have a sound, for example a card that a hold step showed. */
  skip?: ReadonlySet<number>;
}

/**
 * The result cues of one action, in event order. `me` holds the seats of this device: on a shared
 * device that is every local seat. A cue that comes two times in a row plays one time.
 */
export function cuesFor(
  events: readonly GameEvent[],
  me: ReadonlySet<string>,
  options: CueOptions = {},
): Cue[] {
  const cues: Cue[] = [];
  const gainOf = (playerId: string) => (me.has(playerId) ? 1 : OTHER_GAIN);
  const add = (name: CueName, gain = 1, rate?: number) => {
    const last = cues.at(-1);
    if (last?.name === name) {
      last.gain = Math.max(last.gain, gain);
      return;
    }
    cues.push(rate === undefined ? { name, gain } : { name, gain, rate });
  };
  // A cue that plays one time for one action, as loud as the loudest player it is for.
  const addOnce = (name: CueName, gain: number) => {
    const known = cues.find((cue) => cue.name === name);
    if (known) known.gain = Math.max(known.gain, gain);
    else cues.push({ name, gain });
  };
  const gameEnds = events.some((event) => event.type === "GameEnded");

  events.forEach((event, index) => {
    if (options.skip?.has(index)) return;
    switch (event.type) {
      case "TaxPaid":
        addOnce("coin-out", gainOf(event.playerId));
        break;
      case "CashChanged":
        // A card that takes money. A card that gives money rings the coins with the balance.
        if (event.amount < 0) addOnce("coin-out", gainOf(event.playerId));
        break;
      case "PropertyBought":
        add("stamp", gainOf(event.playerId));
        break;
      case "BuildingBuilt":
        add("build", gainOf(event.playerId));
        break;
      case "BuildingSold":
        add("unbuild", gainOf(event.playerId));
        break;
      case "PropertyMortgaged":
        add("paper", gainOf(event.playerId));
        break;
      case "PropertyUnmortgaged":
        add("paper", gainOf(event.playerId), 1.2);
        break;
      case "CardDrawn":
        add("card", gainOf(event.playerId));
        break;
      case "SentToJail":
        add("jail", gainOf(event.playerId));
        break;
      case "AuctionStarted":
        add("gavel", 0.6);
        break;
      case "BidPlaced":
        add("bid", gainOf(event.playerId));
        break;
      case "AuctionEnded":
        add("gavel");
        break;
      case "TradeProposed":
        add("trade-offer", me.has(event.toId) ? 1 : OTHER_GAIN);
        break;
      case "TradeAccepted":
        add("trade-yes", me.has(event.fromId) || me.has(event.toId) ? 1 : OTHER_GAIN);
        break;
      case "TradeRejected":
      case "TradeCancelled":
        add("trade-no", me.has(event.fromId) || me.has(event.toId) ? 1 : OTHER_GAIN);
        break;
      case "BankruptcyDeclared":
      case "PlayerEliminated":
        if (!cues.some((cue) => cue.name === "bankrupt")) add("bankrupt", gainOf(event.playerId));
        break;
      case "TurnEnded":
        if (!gameEnds && me.has(event.nextPlayerId)) add("bell");
        break;
      case "GameEnded":
        add(me.has(event.winnerId) ? "win" : "end");
        break;
      default:
        break;
    }
  });
  return cues;
}

/** The cash of each player, by player id. */
export type CashMap = ReadonlyMap<string, number>;

export function cashOf(players: readonly { id: string; cash: number }[]): CashMap {
  return new Map(players.map((player) => [player.id, player.cash]));
}

/**
 * The coin ring of one action: it plays one time if the balance of any player went up, as loud as
 * the loudest player it is for. A player that is not in `before` has no known change. The sad
 * cue for a payment is not here: `cuesFor` plays it for a tax and for a card that takes money.
 */
export function moneyCues(before: CashMap, after: CashMap, me: ReadonlySet<string>): Cue[] {
  let up = 0;
  for (const [playerId, cash] of after) {
    const old = before.get(playerId);
    if (old === undefined || cash <= old) continue;
    up = Math.max(up, me.has(playerId) ? 1 : OTHER_GAIN);
  }
  return up > 0 ? [{ name: "coin-in", gain: up }] : [];
}
