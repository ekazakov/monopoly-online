import type { ActionType } from "@monopoly/game-engine";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, FocusEvent, ReactNode } from "react";
import { mayActWith, useGame, useGameActions } from "../../../game/index.ts";
import { buildingText, handOf, money } from "./handModel.ts";
import type { HandCard, HandGroup } from "./handModel.ts";
import { PropertyDetail } from "./PropertyDetail.tsx";
import { propertyActions } from "./propertyActions.ts";
import type { ManageAction } from "./propertyActions.ts";
import "./PropertyHand.css";

export interface PropertyHandProps {
  userId: string;
}

/** Spec 4.6: the hand opens about 150 ms after the pointer enters and closes about 300 ms after it leaves. */
export const HOVER_OPEN_MS = 150;
export const HOVER_CLOSE_MS = 300;

/** Height of a collapsed card and the step between the cards of a column (spec 4.6). */
const CARD_H = 60;
const CARD_STEP = 22;

// closed: peeking stacks. open: opened by hover or focus, it closes when they go. pinned: opened
// by a click or a tap, it closes by a second click or Esc.
type Mode = "closed" | "open" | "pinned";

const columnHeight = (count: number) => CARD_H + CARD_STEP * (count - 1);

function HouseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 40 40" aria-hidden="true">
      <rect x="8" y="18" width="24" height="18" fill="var(--hf-house)" />
      <path d="M3 20L20 4l17 16z" fill="var(--hf-house-roof)" />
    </svg>
  );
}

function HotelIcon() {
  return (
    <svg width="22" height="12" viewBox="0 0 72 40" aria-hidden="true">
      <rect x="6" y="14" width="60" height="22" fill="var(--hf-hotel)" />
      <rect x="2" y="6" width="68" height="10" fill="var(--hf-hotel-roof)" />
    </svg>
  );
}

function Tick() {
  return (
    <svg
      className="property-hand__tick"
      width="9"
      height="9"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

const groupName = (group: HandGroup) =>
  `${group.label}${group.cards.length > 1 ? ` · ${group.cards.length}` : ""}${group.complete ? ", set complete" : ""}`;

function CardFace({ card, color, complete }: { card: HandCard; color: string; complete: boolean }) {
  const pips =
    card.houses === 5 ? (
      <HotelIcon />
    ) : (
      Array.from({ length: card.houses }, (_, i) => <HouseIcon key={i} />)
    );
  return (
    <>
      <span className="property-hand__band" style={{ background: color }}>
        {complete && !open ? (
          <span className="property-hand__set">
            <Tick />
          </span>
        ) : null}
      </span>
      <span className="property-hand__row">
        <span className="property-hand__name">{card.name}</span>
        <span className="property-hand__price">{money(card.price)}</span>
      </span>
      <span className="property-hand__pips">
        {card.mortgaged ? <span className="property-hand__tag">Mortgaged</span> : pips}
      </span>
    </>
  );
}

const cardName = (card: HandCard) =>
  `${card.name}, ${money(card.price)}, ${card.mortgaged ? "mortgaged" : buildingText(card.houses)}, ${card.rent}`;

interface GridProps {
  groups: HandGroup[];
  onPin: () => void;
}

// Collapsed cards are a visual preview; the invisible hand control handles keyboard access.
function Grid({ groups, onPin }: GridProps) {
  return (
    <div className="property-hand__grid" aria-hidden="true" onClick={onPin}>
      {groups.map((group) => {
        const count = group.cards.length;
        return (
          <ul
            className="property-hand__col"
            key={group.group}
            aria-label={groupName(group)}
            style={{ "--n": count } as CSSProperties}
          >
            {group.cards.map((card, i) => (
              <li
                key={card.square}
                className="property-hand__slot"
                style={{ "--i": i } as CSSProperties}
              >
                <div className="property-hand__card" data-mortgaged={card.mortgaged || undefined}>
                  <CardFace card={card} color={group.color} complete={group.complete} />
                </div>
              </li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}

// The hand shows the acting seat when it belongs to this device. Otherwise it shows the seat
// picked in the switcher, or the last seat of this device that acted (gameplay doc, section 3).
export function PropertyHand({ userId }: PropertyHandProps) {
  const view = useGame(userId);
  const { game, state } = view;
  const actions = useGameActions();
  const { pending, error, errorSource } = actions;
  const panelId = useId();
  const detailId = useId();

  const [mode, setMode] = useState<Mode>("closed");
  const [lastActing, setLastActing] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [prevDebt, setPrevDebt] = useState(false);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const hovered = useRef(false);
  const focusWithin = useRef(false);
  const skipFocusOpen = useRef(false);
  const tabWasOpen = useRef(false);

  const live = state
    ? view.mySeats.filter((s) => state.players.some((p) => p.id === s.id && p.active))
    : [];
  const candidates = live.length > 0 ? live : view.mySeats;
  const actingMine =
    view.actingSeat && candidates.some((s) => s.id === view.actingSeat?.id)
      ? view.actingSeat.id
      : null;

  // Render-time state: a new acting seat of this device wins the hand, so the next player sees their properties at once.
  if (actingMine && actingMine !== lastActing) {
    setLastActing(actingMine);
    setPicked(null);
  }
  const seat =
    candidates.find((s) => s.id === actingMine) ??
    candidates.find((s) => s.id === picked) ??
    candidates.find((s) => s.id === lastActing) ??
    candidates[0] ??
    null;

  // The panel opens by itself while this device settles a debt (spec 4.6).
  const debtOpen = actingMine !== null && state?.turn.phase === "awaiting_debt";
  if (debtOpen !== prevDebt) {
    setPrevDebt(debtOpen);
    if (debtOpen) setMode("pinned");
  }

  const hand = useMemo(() => (state && seat ? handOf(state, seat.id) : null), [state, seat]);

  useEffect(() => {
    return () => {
      window.clearTimeout(openTimer.current);
      window.clearTimeout(closeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (mode === "closed") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMode("closed");
      if (surfaceRef.current?.contains(document.activeElement)) {
        skipFocusOpen.current = true;
        toggleRef.current?.focus();
        skipFocusOpen.current = false;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mode]);

  if (!state || !seat || !hand) return <div className="property-hand" />;

  const open = mode !== "closed";
  const tallest = hand.groups.reduce((most, g) => Math.max(most, g.cards.length), 0);

  const onMouseEnter = () => {
    hovered.current = true;
    window.clearTimeout(closeTimer.current);
    window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(() => {
      setMode((m) => (m === "closed" ? "open" : m));
    }, HOVER_OPEN_MS);
  };
  const onMouseLeave = () => {
    hovered.current = false;
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      setMode((m) => (m === "open" && !focusWithin.current ? "closed" : m));
    }, HOVER_CLOSE_MS);
  };
  const enteredFrom = (event: FocusEvent) => !surfaceRef.current?.contains(event.relatedTarget);
  const onFocus = (event: FocusEvent) => {
    if (!enteredFrom(event)) return;
    focusWithin.current = true;
    if (!skipFocusOpen.current) setMode((m) => (m === "closed" ? "open" : m));
  };
  const onBlur = (event: FocusEvent) => {
    if (!enteredFrom(event)) return;
    focusWithin.current = false;
    setMode((m) => (m === "open" && !hovered.current ? "closed" : m));
  };
  const close = () => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    setMode("closed");
    skipFocusOpen.current = true;
    toggleRef.current?.focus();
    skipFocusOpen.current = false;
  };
  const togglePinned = () => {
    if (mode === "pinned") close();
    else setMode("pinned");
  };

  const run = (type: ManageAction, square: number) => {
    actions.send({ type, square }, { seatId: seat.id, source: "hand" }).catch(() => {
      // The rejection is shown from `error` of the actions context.
    });
  };

  const may = (type: ActionType) => mayActWith(game, state, seat.id, type);
  const title = `${seat.name}'s properties`;
  const switcher: ReactNode =
    actingMine === null && candidates.length > 1 ? (
      <div className="property-hand__switcher" role="group" aria-label="Show properties of">
        {candidates.map((s) => (
          <button
            key={s.id}
            type="button"
            className="property-hand__seat"
            aria-pressed={s.id === seat.id}
            onClick={() => {
              setPicked(s.id);
            }}
          >
            {s.name}
          </button>
        ))}
      </div>
    ) : null;

  return (
    <div
      className="property-hand"
      style={
        {
          "--hand-h": tallest > 0 ? `${columnHeight(tallest)}px` : "0px",
        } as CSSProperties
      }
      data-seat={seat.id}
    >
      <div
        ref={surfaceRef}
        className="property-hand__surface"
        data-open={open}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        <p className="property-hand__status" role="status" aria-live="polite" aria-atomic="true">
          {error && errorSource === "hand" ? error.message : ""}
        </p>
        <button
          ref={toggleRef}
          type="button"
          className="property-hand__tab"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-label={`${title}, ${hand.count} ${hand.count === 1 ? "property" : "properties"}, ${money(hand.value)}`}
          onMouseDown={() => {
            tabWasOpen.current = open;
          }}
          onClick={() => {
            if (tabWasOpen.current || mode === "pinned") close();
            else setMode("pinned");
          }}
        ></button>
        <div id={panelId} className="property-hand__body">
          {open ? (
            <>
              <header className="property-hand__manage-header">
                <h2>Manage properties · {seat.name}</h2>
                <p>
                  Cash {money(state.players.find((player) => player.id === seat.id)?.cash ?? 0)} ·{" "}
                  {hand.count} properties
                </p>
                {switcher}
              </header>
              <div
                className="property-hand__manage-list"
                role="region"
                aria-label={title}
                tabIndex={0}
              >
                {hand.count === 0 ? (
                  <p className="property-hand__empty">No properties yet.</p>
                ) : null}
                {hand.groups.map((group) => (
                  <section key={group.group} className="property-hand__manage-group">
                    <h3>
                      {group.label}{" "}
                      {group.complete ? (
                        <span>
                          <Tick /> Set complete
                        </span>
                      ) : null}
                    </h3>
                    <ul aria-label={groupName(group)}>
                      {group.cards.map((card) => {
                        const rowId = `${detailId}-${card.square}`;
                        return (
                          <li
                            key={card.square}
                            className="property-hand__manage-row"
                            style={{ "--group-color": group.color } as CSSProperties}
                          >
                            <div
                              className="property-hand__property"
                              role="group"
                              aria-label={cardName(card)}
                            >
                              <strong>{card.name}</strong>
                              <span>
                                {card.mortgaged ? "Mortgaged" : buildingText(card.houses)} ·{" "}
                                {card.rent}
                              </span>
                              <span className="property-hand__buildings" aria-hidden="true">
                                {card.houses === 5 ? (
                                  <HotelIcon />
                                ) : (
                                  Array.from({ length: card.houses }, (_, i) => (
                                    <HouseIcon key={i} />
                                  ))
                                )}
                              </span>
                            </div>
                            <PropertyDetail
                              id={rowId}
                              card={card}
                              actions={propertyActions(state, seat.id, card.square)}
                              may={may}
                              busy={pending}
                              onAction={(type) => {
                                setMode("pinned");
                                run(type, card.square);
                              }}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            </>
          ) : hand.count > 0 ? (
            <Grid groups={hand.groups} onPin={togglePinned} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
