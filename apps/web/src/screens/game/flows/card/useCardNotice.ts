import { useState } from "react";
import type { DeckName } from "@monopoly/shared";
import { useGame } from "../../../../game/index.ts";
import { cardAt, DECK_LABELS, effectText } from "./cardText.ts";

export interface CardNoticeState {
  /** `<version>:<index of the event>`. It changes for every card, so a view can restart its entry motion. */
  key: string;
  deck: DeckName;
  deckLabel: string;
  title: string;
  text: string;
  drawerId: string;
  drawerName: string;
  /** The player who drew it is a seat of this device. */
  mine: boolean;
  /** Closes the card on this device only. Nothing goes to the server. */
  dismiss: () => void;
}

/**
 * The card to show in the board centre now, or null.
 *
 * Source: the events of the latest accepted action (`lastActionEvents`). The store empties them
 * on a snapshot and on the next action, so a reload or a reconnect never brings an old card back,
 * and the card goes away when the game moves on, also when nobody pressed OK.
 *
 * Rule for a component that mounts later than the draw (for example a remount while the store
 * lives on): only an action newer than the version at mount can show a card. A draw that is
 * already the latest action at mount is treated as seen.
 *
 * One action may draw twice (Back three can land on a Chest square). The cards show one after
 * the other: OK on the first shows the second.
 */
export function useCardNotice(userId: string | null): CardNoticeState | null {
  const view = useGame(userId);
  const [mountVersion] = useState(view.version);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());

  if (view.version <= mountVersion) return null;
  for (const [index, event] of view.lastActionEvents.entries()) {
    if (event.type !== "CardDrawn") continue;
    const key = `${view.version}:${index}`;
    if (dismissed.has(key)) continue;
    const card = cardAt(event.deck, event.cardIndex);
    const drawerName =
      view.state?.players.find((p) => p.id === event.playerId)?.name ??
      view.game?.seats.find((seat) => seat.id === event.playerId)?.name ??
      "A player";
    return {
      key,
      deck: event.deck,
      deckLabel: DECK_LABELS[event.deck],
      title: card?.title ?? "A card",
      text: card ? effectText(card.effect) : "",
      drawerId: event.playerId,
      drawerName,
      mine: view.mySeats.some((seat) => seat.id === event.playerId),
      dismiss: () => setDismissed((prev) => new Set(prev).add(key)),
    };
  }
  return null;
}
