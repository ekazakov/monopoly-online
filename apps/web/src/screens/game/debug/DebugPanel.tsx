import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import type { DebugChange, RedactedGameState } from "@monopoly/shared";
import { useGame, useGameActions } from "../../../game/index.ts";
import {
  buildingLabel,
  debugAccess,
  DEED_OPTIONS,
  deedChange,
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
type Send = (change: DebugChange, done: string) => Promise<void>;

// The debug panel (spec 4.7): the player on turn edits cash, deeds and token squares to test the
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

  const send: Send = async (change, done) => {
    if (!access.seat || disabled) return;
    setSending(true);
    setStatus(null);
    try {
      await actions.send({ type: "DebugEdit", change }, { seatId: access.seat.id, source: "menu" });
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
                    { kind: "cash", targetId: player.id, cash },
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
  const [square, setSquare] = useState(DEED_OPTIONS[0]?.square ?? 1);
  const entry = state?.ownership[String(square)];
  const [draft, setDraft] = useState<DeedDraft>(() => deedDraft(state, square));
  // The form follows the deed when another square is chosen or the deed changes.
  const entryKey = JSON.stringify(entry ?? null);
  useEffect(() => {
    setDraft(deedDraft(state, square));
    // `state` changes on every action; the deed itself is what matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [square, entryKey]);

  const option = DEED_OPTIONS.find((o) => o.square === square);
  const bank = draft.ownerId === "";
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const change = deedChange(square, draft);
    const name = option?.name ?? "The deed";
    void send(
      change,
      bank ? `${name} is back with the bank.` : `${name} now belongs to ${nameOf(draft.ownerId)}.`,
    );
  };

  return (
    <form onSubmit={submit}>
      <fieldset className="debug-panel__group" disabled={disabled}>
        <legend className="debug-panel__legend">Deeds</legend>
        <label className="debug-panel__field">
          <span className="debug-panel__label">Deed</span>
          <select
            className="debug-panel__input"
            value={square}
            onChange={(event) => setSquare(Number(event.target.value))}
          >
            {DEED_OPTIONS.map((o) => {
              const owner = state?.ownership[String(o.square)]?.ownerId;
              return (
                <option key={o.square} value={o.square}>
                  {o.name} ({owner ? nameOf(owner) : "Bank"})
                </option>
              );
            })}
          </select>
        </label>
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
            disabled={bank || !option?.street || draft.mortgaged}
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
          <button type="submit" className="debug-panel__btn">
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
      { kind: "position", targetId: target.id, square },
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
