import { useT } from "../../../i18n/index.ts";
import { useState } from "react";
import type { Token } from "@monopoly/shared";
import { useGame } from "../../../game/index.ts";

export interface TurnNotice {
  /** `<version>`. It changes with every action, so a closed notice stays closed for its turn. */
  key: string;
  name: string;
  /** The token of the next player, for the figure on the notice. */
  token: Token | null;
}

/**
 * The notice that says whose turn it is, on every device (spec 5.3, BUG-15).
 *
 * Source: the `TurnEnded` event of the latest accepted action (`lastActionEvents`). The store
 * empties them on a snapshot, so a reload shows no notice. Like the card notice, a component that
 * mounts later than the action sees only the actions after its mount.
 */
export function useTurnNotice(userId: string | null): TurnNotice | null {
  const t = useT();
  const view = useGame(userId);
  const [mountVersion] = useState(view.version);
  if (view.version <= mountVersion) return null;
  const ended = view.lastActionEvents.find((event) => event.type === "TurnEnded");
  if (!ended || ended.type !== "TurnEnded") return null;
  const seat = view.game?.seats.find((s) => s.id === ended.nextPlayerId);
  const name =
    seat?.name ??
    view.state?.players.find((p) => p.id === ended.nextPlayerId)?.name ??
    t("card.aPlayer");
  return { key: String(view.version), name, token: seat?.token ?? null };
}
