import { outstanding } from "@monopoly/game-engine";
import type { ActionType, GameState } from "@monopoly/game-engine";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, FocusEvent, ReactNode } from "react";
import { mayActWith, useGame, useGameActions } from "../../../game/index.ts";
import { buildingText, handOf, money } from "./handModel.ts";
import type { HandCard, HandGroup } from "./handModel.ts";
import { ACTION_OF, propertyActions } from "./propertyActions.ts";
import type { ManageAction, PropertyActions } from "./propertyActions.ts";
import "./PropertyHand.css";

export interface PropertyHandProps {
  userId: string;
}

/** Spec 4.6: the hand opens about 150 ms after the pointer enters and closes about 300 ms after it leaves. */
export const HOVER_OPEN_MS = 150;
export const HOVER_CLOSE_MS = 300;

/** Card height and the step between the cards of a collapsed stack (spec 4.6). */
const CARD_H = 72;
const CARD_STEP = 25;

// closed: peeking stacks. open: opened by hover or focus, it closes when they go. pinned: opened
// by a click or a tap, it closes by a second click or Esc.
type Mode = "closed" | "open" | "pinned";

const stackHeight = (count: number) => CARD_H + CARD_STEP * (count - 1);

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
      width="14"
      height="14"
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

function Chevron() {
  return (
    <svg
      className="property-hand__chevron"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 15l6-6 6 6" />
    </svg>
  );
}

function StackLabel({ group, id }: { group: HandGroup; id?: string }) {
  return (
    <span className="property-hand__label" id={id}>
      {group.label}
      {group.cards.length > 1 ? ` · ${group.cards.length}` : ""}
      {group.complete ? (
        <>
          <Tick />
          <span className="property-hand__sr">, set complete</span>
        </>
      ) : null}
    </span>
  );
}

function CardFace({ card, color }: { card: HandCard; color: string }) {
  const pips =
    card.houses === 5 ? (
      <HotelIcon />
    ) : (
      Array.from({ length: card.houses }, (_, i) => <HouseIcon key={i} />)
    );
  return (
    <>
      <span className="property-hand__band" style={{ background: color }} />
      <span className="property-hand__row">
        <span className="property-hand__name">{card.name}</span>
        <span className="property-hand__price">{money(card.price)}</span>
      </span>
      <span className="property-hand__row property-hand__row--state">
        <span className="property-hand__pips">
          {card.mortgaged ? <span className="property-hand__tag">Mortgaged</span> : pips}
        </span>
        <span className="property-hand__rent">{card.rent}</span>
      </span>
    </>
  );
}

const cardName = (card: HandCard) =>
  `${card.name}, ${money(card.price)}, ${card.mortgaged ? "mortgaged" : buildingText(card.houses)}, ${card.rent}`;

interface ActionButtonProps {
  label: string;
  amount: string | null;
  allowed: boolean;
  reason: string | null;
  busy: boolean;
  onClick: () => void;
}

function ActionButton({ label, amount, allowed, reason, busy, onClick }: ActionButtonProps) {
  const reasonId = useId();
  const shown = allowed ? null : reason;
  // `aria-disabled`, not `disabled`: a disabled button drops the keyboard focus and the reason is read.
  const blocked = !allowed || busy;
  return (
    <div className="property-hand__action">
      <button
        type="button"
        className="property-hand__button"
        aria-disabled={blocked}
        aria-describedby={shown ? reasonId : undefined}
        onClick={() => {
          if (!blocked) onClick();
        }}
      >
        {label}
        {amount ? (
          <>
            {" "}
            <span className="property-hand__amount">{amount}</span>
          </>
        ) : null}
      </button>
      {shown ? (
        <span className="property-hand__reason" id={reasonId}>
          {shown}
        </span>
      ) : null}
    </div>
  );
}

interface DetailProps {
  id: string;
  card: HandCard;
  actions: PropertyActions;
  /** The engine `mayAct` check for each action, from the game store. */
  may: (type: ActionType) => boolean;
  busy: boolean;
  onAction: (type: ManageAction) => void;
}

function Detail({ id, card, actions, may, busy, onAction }: DetailProps) {
  const refusal = (key: keyof typeof ACTION_OF, enabled: boolean) =>
    enabled && may(ACTION_OF[key]) ? null : (actions.reason[key] ?? "Wait for your turn");
  const canBuild = actions.canBuild && may("Build");
  const canSell = actions.canSell && may("SellBuilding");
  const canMortgage = actions.canMortgage && may("Mortgage");
  const canUnmortgage = actions.canUnmortgage && may("Unmortgage");
  const dollars = (amount: number | null, sign = "") =>
    amount === null ? null : `${sign}${money(amount)}`;

  return (
    <div id={id} className="property-hand__detail" role="group" aria-label={`${card.name} actions`}>
      <p className="property-hand__info">
        <strong>{card.name}</strong>
        {` · ${card.mortgaged ? "mortgaged" : buildingText(card.houses)} · ${card.rent}`}
      </p>
      {actions.manageable ? (
        <div className="property-hand__actions">
          {card.kind === "street" ? (
            <>
              <ActionButton
                label={card.houses === 4 ? "Build hotel" : "Build"}
                amount={dollars(actions.cost.build)}
                allowed={canBuild}
                reason={refusal("build", canBuild)}
                busy={busy}
                onClick={() => onAction("Build")}
              />
              <ActionButton
                label="Sell building"
                amount={dollars(actions.cost.sell, "+")}
                allowed={canSell}
                reason={refusal("sell", canSell)}
                busy={busy}
                onClick={() => onAction("SellBuilding")}
              />
            </>
          ) : null}
          {card.mortgaged ? (
            <ActionButton
              key="mortgage"
              label="Unmortgage"
              amount={dollars(actions.cost.unmortgage)}
              allowed={canUnmortgage}
              reason={refusal("unmortgage", canUnmortgage)}
              busy={busy}
              onClick={() => onAction("Unmortgage")}
            />
          ) : (
            <ActionButton
              key="mortgage"
              label="Mortgage"
              amount={dollars(actions.cost.mortgage, "+")}
              allowed={canMortgage}
              reason={refusal("mortgage", canMortgage)}
              busy={busy}
              onClick={() => onAction("Mortgage")}
            />
          )}
        </div>
      ) : (
        <p className="property-hand__viewonly">View only: {actions.notNow?.toLowerCase()}</p>
      )}
    </div>
  );
}

// A click on the peek pins the hand open (spec 4.6). The keyboard has the toggle button instead.
function Peek({ groups, onClick }: { groups: HandGroup[]; onClick: () => void }) {
  return (
    <div className="property-hand__peek" aria-hidden="true" onClick={onClick}>
      {groups.map((group) => {
        const count = group.cards.length;
        return (
          <div className="property-hand__stack" key={group.group}>
            <StackLabel group={group} />
            <div
              className="property-hand__stack-cards"
              style={{ height: stackHeight(count), "--n": count } as CSSProperties}
            >
              {group.cards.map((card, i) => (
                <div
                  key={card.square}
                  className="property-hand__card"
                  data-mortgaged={card.mortgaged || undefined}
                  style={{ "--i": i } as CSSProperties}
                >
                  <CardFace card={card} color={group.color} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface Selection {
  seatId: string;
  square: number;
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
  const [selection, setSelection] = useState<Selection | null>(null);
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

  const live = state
    ? view.mySeats.filter((s) => state.players.some((p) => p.id === s.id && p.active))
    : [];
  const candidates = live.length > 0 ? live : view.mySeats;
  const actingMine =
    view.actingSeat && candidates.some((s) => s.id === view.actingSeat?.id)
      ? view.actingSeat.id
      : null;

  // Render-time state, as `useHotSeatHandoff` does: a new acting seat of this device wins the hand.
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

  if (mode === "closed" && selection) setSelection(null);

  if (!state || !seat || !hand) return <div className="property-hand" />;

  const open = mode !== "closed";
  const selected =
    open && selection?.seatId === seat.id
      ? hand.groups.flatMap((g) => g.cards).find((c) => c.square === selection.square)
      : undefined;
  const owes = outstanding(state as unknown as GameState, seat.id);
  const peekHeight = hand.groups.reduce(
    (tallest, g) => Math.max(tallest, stackHeight(g.cards.length)),
    0,
  );

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
  const togglePinned = () => setMode((m) => (m === "pinned" ? "closed" : "pinned"));

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
              setSelection(null);
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
      style={{ "--hand-h": `${peekHeight}px` } as CSSProperties}
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
        <div className="property-hand__head">
          <button
            ref={toggleRef}
            type="button"
            className="property-hand__toggle"
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            aria-label={`${title}, ${hand.count} ${hand.count === 1 ? "property" : "properties"}, ${money(hand.value)}`}
            onClick={togglePinned}
          >
            <span className="property-hand__title">{title}</span>
            <span className="property-hand__meta">
              {hand.count} · {money(hand.value)}
            </span>
            <Chevron />
          </button>
          {owes > 0 ? <span className="property-hand__owes">Owes {money(owes)}</span> : null}
          {switcher}
        </div>
        {open ? (
          <div id={panelId} className="property-hand__panel">
            {hand.count === 0 ? (
              <p className="property-hand__empty">No properties yet.</p>
            ) : (
              <ul className="property-hand__groups" aria-label="Properties by colour">
                {hand.groups.map((group) => (
                  <li key={group.group} className="property-hand__group">
                    <StackLabel group={group} id={`${panelId}-${group.group}`} />
                    <ul
                      className="property-hand__cards"
                      aria-labelledby={`${panelId}-${group.group}`}
                    >
                      {group.cards.map((card) => (
                        <li key={card.square}>
                          <button
                            type="button"
                            className="property-hand__card property-hand__card--button"
                            data-mortgaged={card.mortgaged || undefined}
                            aria-label={cardName(card)}
                            aria-expanded={selected?.square === card.square}
                            aria-controls={selected?.square === card.square ? detailId : undefined}
                            onClick={() =>
                              setSelection(
                                selected?.square === card.square
                                  ? null
                                  : { seatId: seat.id, square: card.square },
                              )
                            }
                          >
                            <CardFace card={card} color={group.color} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
            {selected ? (
              <Detail
                id={detailId}
                card={selected}
                actions={propertyActions(state, seat.id, selected.square)}
                may={may}
                busy={pending}
                onAction={(type) => run(type, selected.square)}
              />
            ) : null}
          </div>
        ) : (
          <Peek groups={hand.groups} onClick={togglePinned} />
        )}
      </div>
    </div>
  );
}
