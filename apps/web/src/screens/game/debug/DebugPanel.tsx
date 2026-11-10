import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import type { DebugChange, DeckName, RedactedGameState } from "@monopoly/shared";
import { CHANCE_CARDS, CHEST_CARDS } from "@monopoly/game-engine";
import { DECK_LABELS } from "../flows/card/cardText.ts";
import { useGame, useGameActions } from "../../../game/index.ts";
import {
  buildingLabel,
  debugAccess,
  DEED_GROUPS,
  DEED_OPTIONS,
  deedChanges,
  deedDraft,
  parseCash,
  SQUARE_OPTIONS,
} from "./debugModel.ts";
import type { DeedDraft } from "./debugModel.ts";
import "./DebugPanel.css";

export interface DebugPanelProps {
  userId: string;
}

type Player = RedactedGameState["players"][number];
type Send = (changes: DebugChange[], done: string) => Promise<void>;

// The debug panel (spec 4.7): the player on turn edits cash, deeds, token squares, the next dice
// roll and the top card of a deck to test the
// game logic. It is a disclosure in place next to the Menu button, like the Leave game panel.
// The edits go to the server as `DebugEdit` actions, so they stay in the game log.
export function DebugPanel({ userId }: DebugPanelProps) {
  const { game, state } = useGame(userId);
  const actions = useGameActions();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);

  const access = debugAccess(game, state, userId);
  const disabled = access.seat === null || actions.pending || sending;
  const players = state?.players.filter((p) => p.active) ?? [];

  const close = () => {
    setOpen(false);
    setStatus(null);
  };

  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !open) return;
    event.stopPropagation();
    close();
    buttonRef.current?.focus();
  };

  const send: Send = async (changes, done) => {
    if (!access.seat || disabled) return;
    setSending(true);
    setStatus(null);
    try {
      await actions.send(
        { type: "DebugEdit", changes },
        { seatId: access.seat.id, source: "menu" },
      );
      setStatus({ text: done, error: false });
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : "The edit failed. Try again.";
      setStatus({ text, error: true });
    } finally {
      setSending(false);
    }
  };

  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? "A player";

  return (
    <div className="debug-panel" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className="debug-panel__button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
      >
        Debug
      </button>
      {open && (
        <section
          id={panelId}
          className="debug-panel__panel"
          aria-labelledby={`${panelId}-title`}
          aria-busy={sending || undefined}
        >
          <h2 id={`${panelId}-title`} className="debug-panel__title" tabIndex={-1} ref={headingRef}>
            Debug
          </h2>
          <p className="debug-panel__hint">
            {access.reason ?? "Edits ignore the rules. Each edit is a line in the game log."}
          </p>

          <fieldset className="debug-panel__group" disabled={disabled}>
            <legend className="debug-panel__legend">Cash</legend>
            {players.map((player) => (
              <CashRow
                key={`${player.id}:${player.cash}`}
                player={player}
                onSet={(cash) =>
                  send(
                    [{ kind: "cash", targetId: player.id, cash }],
                    `${player.name}'s cash is now $${cash}.`,
                  )
                }
              />
            ))}
          </fieldset>

          <DeedForm
            state={state}
            players={players}
            disabled={disabled}
            send={send}
            nameOf={nameOf}
          />

          <TokenForm players={players} disabled={disabled} send={send} />

          <DiceForm disabled={disabled} send={send} />

          <CardForm disabled={disabled} send={send} />

          <p
            className={`debug-panel__status${status?.error ? " debug-panel__status--error" : ""}`}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {sending ? "Saving…" : (status?.text ?? "")}
          </p>
        </section>
      )}
    </div>
  );
}

// Keyed by the player's cash, so the field shows the new value after any change.
function CashRow({ player, onSet }: { player: Player; onSet: (cash: number) => void }) {
  const [text, setText] = useState(String(player.cash));
  const cash = parseCash(text);
  const id = useId();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (cash !== null) onSet(cash);
  };
  return (
    <form className="debug-panel__row" onSubmit={submit}>
      <label className="debug-panel__label" htmlFor={id}>
        {player.name}
      </label>
      <input
        id={id}
        className="debug-panel__input"
        inputMode="numeric"
        value={text}
        aria-invalid={cash === null || undefined}
        onChange={(event) => setText(event.target.value)}
      />
      <button
        type="submit"
        className="debug-panel__btn"
        disabled={cash === null}
        aria-label={`Set ${player.name}'s cash`}
      >
        Set
      </button>
    </form>
  );
}

interface DeedFormProps {
  state: RedactedGameState | null;
  players: readonly Player[];
  disabled: boolean;
  send: Send;
  nameOf: (id: string) => string;
}

function DeedForm({ state, players, disabled, send, nameOf }: DeedFormProps) {
  const id = useId();
  const [squares, setSquares] = useState<number[]>([DEED_OPTIONS[0]?.square ?? 1]);
  // The form fills from the first chosen deed, and follows it when it changes.
  const first = squares[0];
  const entryKey = JSON.stringify(
    first === undefined ? null : (state?.ownership[String(first)] ?? null),
  );
  const [draft, setDraft] = useState<DeedDraft>(() => deedDraft(state, first ?? 0));
  useEffect(() => {
    setDraft(deedDraft(state, first ?? 0));
    // `state` changes on every action; the first chosen deed itself is what matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first, entryKey]);

  const chosen = DEED_OPTIONS.filter((o) => squares.includes(o.square));
  const anyStreet = chosen.some((o) => o.kind === "street");
  const bank = draft.ownerId === "";
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (chosen.length === 0) return;
    const what = chosen.length === 1 ? (chosen[0]?.name ?? "The deed") : `${chosen.length} deeds`;
    void send(
      deedChanges(squares, draft),
      bank ? `${what} back with the bank.` : `${what} now belong to ${nameOf(draft.ownerId)}.`,
    );
  };

  return (
    <form onSubmit={submit}>
      <fieldset className="debug-panel__group" disabled={disabled}>
        <legend className="debug-panel__legend">Deeds</legend>
        <label className="debug-panel__field debug-panel__field--list">
          <span className="debug-panel__label">Choose</span>
          <select
            multiple
            size={10}
            className="debug-panel__input debug-panel__input--list"
            value={squares.map(String)}
            onChange={(event) =>
              setSquares(Array.from(event.target.selectedOptions, (o) => Number(o.value)))
            }
          >
            {DEED_GROUPS.map((group) => (
              <optgroup key={group.kind} label={group.label}>
                {group.options.map((o) => {
                  const owner = state?.ownership[String(o.square)]?.ownerId;
                  return (
                    <option key={o.square} value={o.square}>
                      {o.name} ({owner ? nameOf(owner) : "Bank"})
                    </option>
                  );
                })}
              </optgroup>
            ))}
          </select>
        </label>
        <p className="debug-panel__hint">
          {chosen.length === 0
            ? "Choose one or more deeds. Hold Shift or Ctrl to choose several."
            : `${chosen.length} chosen. Apply sets the same owner, buildings and mortgage on all of them. Hold Shift or Ctrl to choose several.`}
        </p>
        <label className="debug-panel__field">
          <span className="debug-panel__label">Owner</span>
          <select
            className="debug-panel__input"
            value={draft.ownerId}
            onChange={(event) => setDraft({ ...draft, ownerId: event.target.value })}
          >
            <option value="">Bank</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="debug-panel__field">
          <span className="debug-panel__label">Buildings</span>
          <select
            className="debug-panel__input"
            value={draft.houses}
            disabled={bank || !anyStreet || draft.mortgaged}
            onChange={(event) => setDraft({ ...draft, houses: Number(event.target.value) })}
          >
            {[0, 1, 2, 3, 4, 5].map((houses) => (
              <option key={houses} value={houses}>
                {buildingLabel(houses)}
              </option>
            ))}
          </select>
        </label>
        <label className="debug-panel__check" htmlFor={`${id}-mortgaged`}>
          <input
            id={`${id}-mortgaged`}
            type="checkbox"
            checked={draft.mortgaged}
            disabled={bank}
            onChange={(event) => setDraft({ ...draft, mortgaged: event.target.checked, houses: 0 })}
          />
          Mortgaged
        </label>
        <div className="debug-panel__actions">
          <button type="submit" className="debug-panel__btn" disabled={chosen.length === 0}>
            Apply
          </button>
        </div>
      </fieldset>
    </form>
  );
}

interface TokenFormProps {
  players: readonly Player[];
  disabled: boolean;
  send: Send;
}

function TokenForm({ players, disabled, send }: TokenFormProps) {
  const [targetId, setTargetId] = useState(players[0]?.id ?? "");
  const target = players.find((p) => p.id === targetId) ?? players[0];
  const [square, setSquare] = useState(target?.position ?? 0);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!target) return;
    const name = SQUARE_OPTIONS[square]?.name ?? `square ${square}`;
    void send(
      [{ kind: "position", targetId: target.id, square }],
      `${target.name}'s player token is on ${name}.`,
    );
  };

  return (
    <form onSubmit={submit}>
      <fieldset className="debug-panel__group" disabled={disabled}>
        <legend className="debug-panel__legend">Player tokens</legend>
        <label className="debug-panel__field">
          <span className="debug-panel__label">Player</span>
          <select
            className="debug-panel__input"
            value={target?.id ?? ""}
            onChange={(event) => {
              const next = players.find((p) => p.id === event.target.value);
              setTargetId(event.target.value);
              if (next) setSquare(next.position);
            }}
          >
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="debug-panel__field">
          <span className="debug-panel__label">Square</span>
          <select
            className="debug-panel__input"
            value={square}
            onChange={(event) => setSquare(Number(event.target.value))}
          >
            {SQUARE_OPTIONS.map((o) => (
              <option key={o.square} value={o.square}>
                {o.square}. {o.name}
              </option>
            ))}
          </select>
        </label>
        <p className="debug-panel__hint">
          The token moves with no landing: no rent, card or Start salary.
        </p>
        <div className="debug-panel__actions">
          <button type="submit" className="debug-panel__btn" disabled={!target}>
            Move
          </button>
        </div>
      </fieldset>
    </form>
  );
}

const DIE_VALUES = [1, 2, 3, 4, 5, 6] as const;

// The next roll of the game, whoever rolls it: a turn roll, a jail roll or the utility rent roll.
// The server keeps the values and uses them once. The panel does not show them later.
function DiceForm({ disabled, send }: { disabled: boolean; send: Send }) {
  const [dice, setDice] = useState<[number, number]>([1, 1]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send([{ kind: "next_dice", dice }], `The next roll is ${dice[0]} and ${dice[1]}.`);
  };

  return (
    <form onSubmit={submit}>
      <fieldset className="debug-panel__group" disabled={disabled}>
        <legend className="debug-panel__legend">Next roll</legend>
        {([0, 1] as const).map((die) => (
          <label key={die} className="debug-panel__field">
            <span className="debug-panel__label">Die {die + 1}</span>
            <select
              className="debug-panel__input"
              value={dice[die]}
              onChange={(event) => {
                const value = Number(event.target.value);
                setDice((prev) => (die === 0 ? [value, prev[1]] : [prev[0], value]));
              }}
            >
              {DIE_VALUES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        ))}
        <p className="debug-panel__hint">For one roll only, by any player.</p>
        <div className="debug-panel__actions">
          <button type="submit" className="debug-panel__btn">
            Set
          </button>
        </div>
      </fieldset>
    </form>
  );
}

const DECKS: readonly DeckName[] = ["chance", "chest"];

// The card on top of a deck, for the next draw from it. The device does not know the deck order
// or the held jail cards, so the list has every card. The server refuses a card that a player
// holds.
function CardForm({ disabled, send }: { disabled: boolean; send: Send }) {
  const [deck, setDeck] = useState<DeckName>("chance");
  const [cardIndex, setCardIndex] = useState(0);
  const cards = deck === "chance" ? CHANCE_CARDS : CHEST_CARDS;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const title = cards[cardIndex]?.title ?? "The card";
    void send(
      [{ kind: "top_card", deck, cardIndex }],
      `"${title}" is on top of ${DECK_LABELS[deck]}.`,
    );
  };

  return (
    <form onSubmit={submit}>
      <fieldset className="debug-panel__group" disabled={disabled}>
        <legend className="debug-panel__legend">Top card</legend>
        <label className="debug-panel__field">
          <span className="debug-panel__label">Deck</span>
          <select
            className="debug-panel__input"
            value={deck}
            onChange={(event) => {
              setDeck(event.target.value as DeckName);
              setCardIndex(0);
            }}
          >
            {DECKS.map((name) => (
              <option key={name} value={name}>
                {DECK_LABELS[name]}
              </option>
            ))}
          </select>
        </label>
        <label className="debug-panel__field">
          <span className="debug-panel__label">Card</span>
          <select
            className="debug-panel__input"
            value={cardIndex}
            onChange={(event) => setCardIndex(Number(event.target.value))}
          >
            {cards.map((card, index) => (
              <option key={index} value={index}>
                {card.title}
              </option>
            ))}
          </select>
        </label>
        <p className="debug-panel__hint">The next draw from this deck is this card.</p>
        <div className="debug-panel__actions">
          <button type="submit" className="debug-panel__btn">
            Put on top
          </button>
        </div>
      </fieldset>
    </form>
  );
}
