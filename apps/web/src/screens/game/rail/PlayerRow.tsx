import type { Token } from "@monopoly/shared";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { tokenLook } from "../../../scene/colors.ts";
import { AvatarIcon } from "./avatars.tsx";
import "./PlayerRail.css";

/** Whose seat it is for the signed-in user: their own, a hot-seat seat on this device, or another device. */
export type SeatDevice = "you" | "device" | "other";

export interface PlayerRowProps {
  name: string;
  /** The token of the seat: it picks the pawn colour and the avatar. */
  token: Token;
  cash: number;
  device: SeatDevice;
  /** The player on turn. */
  active: boolean;
  inJail: boolean;
  /** Get Out of Jail Free cards held. */
  jailCards: number;
  /** Bankrupt or resigned: the row stays as a spectator. */
  eliminated: boolean;
  /** Properties owned (streets, stations and utilities). */
  properties: number;
  /** Debt the player owes now, or null. */
  debt: number | null;
}

const money = new Intl.NumberFormat("en-US");
export const formatMoney = (n: number) => `${n < 0 ? "−" : ""}$${money.format(Math.abs(n))}`;

/** How long the cash change stays marked. */
export const CASH_FLASH_MS = 1600;

/** The change of `cash` since the last render, kept for a short time. It is null at rest. */
function useCashChange(cash: number): number | null {
  const [previous, setPrevious] = useState(cash);
  const [change, setChange] = useState<number | null>(null);
  if (cash !== previous) {
    setPrevious(cash);
    setChange(cash - previous);
  }
  useEffect(() => {
    if (change === null) return;
    const timer = setTimeout(() => setChange(null), CASH_FLASH_MS);
    return () => clearTimeout(timer);
  }, [change, cash]);
  return change;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function PlayerRow({
  name,
  token,
  cash,
  device,
  active,
  inJail,
  jailCards,
  eliminated,
  properties,
  debt,
}: PlayerRowProps) {
  const look = tokenLook(token);
  const change = useCashChange(cash);
  const onTurn = active && !eliminated;

  return (
    <li
      className="player-row"
      aria-current={onTurn ? "true" : undefined}
      data-active={onTurn || undefined}
      data-eliminated={eliminated || undefined}
      style={{ "--player-color": look.cssColor } as CSSProperties}
    >
      <div className="player-row__avatar" aria-hidden="true">
        <AvatarIcon kind={look.avatar} />
      </div>
      <div className="player-row__text">
        <span className="player-row__name">
          <span className="player-row__name-text">{name}</span>
          {device === "you" && <span className="player-row__tag player-row__tag--seat">You</span>}
          {onTurn && <span className="player-row__tag player-row__tag--turn">Turn</span>}
        </span>
        <span
          className="player-row__cash"
          data-change={change === null ? undefined : change > 0 ? "up" : "down"}
        >
          {eliminated ? (
            <>
              <span aria-hidden="true">—</span>
              <span className="player-row__sr">no cash</span>
            </>
          ) : (
            <>
              <span className="player-row__coin" aria-hidden="true" />
              <span>{formatMoney(cash)}</span>
              {change !== null && (
                <span className="player-row__delta" aria-hidden="true">
                  {change > 0 ? "+" : "−"}
                  {formatMoney(Math.abs(change))}
                </span>
              )}
            </>
          )}
        </span>
        <span className="player-row__meta">
          {device === "device" && <span>This device</span>}
          {eliminated && <span>Bankrupt</span>}
          {!eliminated && inJail && <span>In jail</span>}
          {!eliminated && jailCards > 0 && (
            <span>{plural(jailCards, "jail card", "jail cards")}</span>
          )}
          {!eliminated && debt !== null && debt > 0 && <span>Owes {formatMoney(debt)}</span>}
          <span>{plural(properties, "property", "properties")}</span>
        </span>
      </div>
    </li>
  );
}
