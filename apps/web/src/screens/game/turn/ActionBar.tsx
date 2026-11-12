import { useId } from "react";
import type { ActionInput, PresenceStatus } from "@monopoly/shared";
import { useT } from "../../../i18n/index.ts";
import type { Translate } from "../../../i18n/index.ts";
import type { Turn } from "./useTurn.ts";

export interface TurnAction {
  label: string;
  action: ActionInput;
  /** One primary action at a time (spec 5.2). The others are outline buttons. */
  primary?: boolean;
  /** Why the button is disabled. It shows as a note and the button points to it. */
  why?: string;
}

interface ActionBarProps {
  turn: Turn;
  actions: readonly TurnAction[];
}

// The buttons of a phase. A device with no seat that may act shows "Waiting for <name>" instead.
export function ActionBar({ turn, actions }: ActionBarProps) {
  const base = useId();
  if (!turn.actor) return <Waiting turn={turn} />;

  return (
    <>
      <div className="turn-area__actions">
        {actions.map((item, index) => (
          <button
            key={item.action.type}
            type="button"
            className={`turn-area__btn turn-area__btn--${item.primary ? "primary" : "outline"}`}
            disabled={turn.pending || Boolean(item.why) || !turn.can(item.action.type)}
            aria-describedby={item.why ? `${base}-${index}` : undefined}
            onClick={() => turn.send(item.action)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {actions.some((item) => item.why) && (
        <ul className="turn-area__notes">
          {actions.map(
            (item, index) =>
              item.why && (
                <li key={item.action.type} id={`${base}-${index}`}>
                  {item.why}
                </li>
              ),
          )}
        </ul>
      )}
    </>
  );
}

/**
 * The board centre of a device that only watches. The game waits for a player who is away or
 * reconnecting, and nothing plays for them (gameplay 3.2), so the line says why and what ends it.
 */
export function Waiting({ turn }: { turn: Pick<Turn, "actorName" | "actorPresence" | "isOwner"> }) {
  const { actorName: name, actorPresence: presence, isOwner } = turn;
  const t = useT();
  const text = waitingText(name, presence, t);
  return (
    <>
      <p className="turn-area__waiting">
        <span className="turn-area__spinner" aria-hidden="true" />
        {text.title}
      </p>
      {text.sub && <p className="turn-area__sub">{text.sub}</p>}
      {isOwner && presence === "away" && <p className="turn-area__sub">{t("turn.menuHint")}</p>}
    </>
  );
}

export function waitingText(
  name: string,
  presence: PresenceStatus | null,
  t: Translate,
): { title: string; sub: string | null } {
  if (!name) return { title: t("turn.waitingGame"), sub: null };
  if (presence === "away") {
    return {
      title: t("turn.waitingReturn", { name }),
      sub: t("turn.continuesReturn", { name }),
    };
  }
  if (presence === "reconnecting") {
    return {
      title: t("turn.reconnecting", { name }),
      sub: t("turn.continuesConnection"),
    };
  }
  return { title: t("turn.waitingFor", { name }), sub: null };
}
