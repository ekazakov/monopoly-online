import { useId } from "react";
import type { ActionInput } from "@monopoly/shared";
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
  if (!turn.actor) return <Waiting name={turn.actorName} />;

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

export function Waiting({ name }: { name: string }) {
  return (
    <p className="turn-area__waiting">
      <span className="turn-area__spinner" aria-hidden="true" />
      {name ? `Waiting for ${name}` : "Waiting for the game"}
    </p>
  );
}
