import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Seat } from "@monopoly/shared";
import { finishGame, saveGame } from "../../../../api/games.ts";
import {
  isFinished,
  mayActWith,
  mySeats,
  useGame,
  useGameActions,
} from "../../../../game/index.ts";
import { tokenLook } from "../../../../scene/colors.ts";
import { consequenceText } from "./consequence.ts";
import "./LeaveGameMenu.css";

export interface LeaveGameMenuProps {
  userId: string;
  /** Called after the last seat of this device resigned, or after a device with no seat left. */
  onLeft?: () => void;
}

type Step = "menu" | "confirm" | "save" | "finish";

// The Menu button and its panel (spec 4.2, 8.7 R-G9). The panel is a disclosure in place, not a
// modal dialog. Leave game is a resignation (gameplay doc, rule 16): on a shared device it asks
// which seat resigns. The owner also gets Save and exit and Finish game (R-G9), each with its own
// confirm step; the screen reacts to the new status of the game (milestone 3, E3). One root
// element, for the `menu` slot.
export function LeaveGameMenu({ userId, onLeft }: LeaveGameMenuProps) {
  const view = useGame(userId);
  const actions = useGameActions();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const leaveRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("menu");
  const [chosen, setChosen] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState<"save" | "finish" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { game, state } = view;
  const nameOf = (seat: Seat) => state?.players.find((p) => p.id === seat.id)?.name ?? seat.name;
  // The seats of this device that can still resign. A finished game has none.
  const seats = mySeats(game, userId).filter((seat) => mayActWith(game, state, seat.id, "Resign"));
  const choice = seats.find((seat) => seat.id === chosen) ?? null;
  const activePlayers = state?.players.filter((p) => p.active).length ?? 0;
  const auction = Boolean(state?.auction);
  const busy = actions.pending || sending || ending !== null;
  // Only the owner of a game that is running. A saved or finished game has no table to leave.
  const isOwner = game?.ownerId === userId && game.status === "active" && !isFinished(game, state);
  const turnName = state?.players.find((p) => p.id === state.turn.currentPlayerId)?.name ?? null;

  const close = () => {
    setOpen(false);
    setStep("menu");
    setChosen(null);
    setError(null);
    setNotice(null);
  };

  const openConfirm = () => {
    const acting = seats.find((seat) => seat.id === view.actingSeat?.id);
    // One seat has nothing to choose. With more, the seat that acts now is the likely one.
    setChosen(seats.length === 1 ? (seats[0]?.id ?? null) : (acting?.id ?? null));
    setError(null);
    setNotice(null);
    setStep("confirm");
  };

  // Focus follows the step, because the button that had it leaves the page.
  useEffect(() => {
    if (!open) return;
    (step === "menu" ? leaveRef : headingRef).current?.focus();
  }, [open, step]);

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

  async function resign() {
    if (!choice || busy || auction) return;
    setSending(true);
    setError(null);
    try {
      await actions.send({ type: "Resign" }, { seatId: choice.id, source: "menu" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not resign. Try again.");
      setSending(false);
      return;
    }
    setSending(false);
    if (seats.length > 1) {
      setNotice(`${nameOf(choice)} resigned.`);
      setChosen(null);
      setStep("menu");
      return;
    }
    close();
    onLeft?.();
  }

  /** Save and exit, or Finish. The new status reaches every device in a `snapshot`. */
  async function endGame(kind: "save" | "finish") {
    if (!game || busy) return;
    setEnding(kind);
    setError(null);
    try {
      await (kind === "save" ? saveGame : finishGame)(game.id);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : `Could not ${kind === "save" ? "save" : "finish"} the game. Try again.`,
      );
      setEnding(null);
      return;
    }
    setEnding(null);
    close();
  }

  const leaveWithoutSeat = () => {
    close();
    onLeft?.();
  };

  const resigning = seats.length > 0;
  const status = sending
    ? "Resigning…"
    : ending === "save"
      ? "Saving…"
      : ending === "finish"
        ? "Finishing…"
        : (error ?? notice ?? "");

  return (
    <div className="leave-menu" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className="leave-menu__button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
      >
        Menu
      </button>
      {open && (
        <div id={panelId} className="leave-menu__panel" aria-busy={busy || undefined}>
          {step === "menu" ? (
            <>
              {isOwner && (
                <>
                  <div className="leave-menu__row">
                    <p className="leave-menu__row-text">
                      <span className="leave-menu__row-title">Save and exit</span>
                      <span className="leave-menu__hint">
                        Keep the game at the start of this turn
                      </span>
                    </p>
                    <button
                      type="button"
                      className="leave-menu__btn"
                      aria-label="Save and exit"
                      onClick={() => {
                        setError(null);
                        setNotice(null);
                        setStep("save");
                      }}
                    >
                      Save
                    </button>
                  </div>
                  <div className="leave-menu__row">
                    <p className="leave-menu__row-text">
                      <span className="leave-menu__row-title">Finish game</span>
                      <span className="leave-menu__hint">End the game with no winner</span>
                    </p>
                    <button
                      type="button"
                      className="leave-menu__btn leave-menu__btn--danger"
                      aria-label="Finish game"
                      onClick={() => {
                        setError(null);
                        setNotice(null);
                        setStep("finish");
                      }}
                    >
                      Finish
                    </button>
                  </div>
                </>
              )}
              <div className="leave-menu__row">
                <p className="leave-menu__row-text">
                  <span className="leave-menu__row-title">Leave game</span>
                  <span className="leave-menu__hint">
                    {seats.length > 1 ? "Resign one of your players" : "Resign and leave the table"}
                  </span>
                </p>
                <button
                  ref={leaveRef}
                  type="button"
                  className="leave-menu__btn leave-menu__btn--danger"
                  aria-label="Leave game"
                  onClick={openConfirm}
                >
                  Leave
                </button>
              </div>
            </>
          ) : step === "save" || step === "finish" ? (
            <section className="leave-menu__confirm" aria-labelledby={`${panelId}-title`}>
              <h2
                id={`${panelId}-title`}
                className="leave-menu__title"
                tabIndex={-1}
                ref={headingRef}
              >
                {step === "save" ? "Save and exit?" : "Finish this game?"}
              </h2>
              <p className="leave-menu__consequence">
                {step === "finish" && "There is no winner. "}
                {turnName
                  ? `The game goes back to the start of ${turnName}'s turn.`
                  : "The game goes back to the start of the turn."}
              </p>
              <p className="leave-menu__hint">
                {step === "save"
                  ? "All players go to the lobby. You can continue the game from your saved games. The dice and cards stay the same."
                  : "All players see the standings, for information only. You cannot undo this."}
              </p>
              <div className="leave-menu__actions">
                <button
                  type="button"
                  className="leave-menu__btn"
                  disabled={busy}
                  onClick={() => {
                    setError(null);
                    setStep("menu");
                  }}
                >
                  Keep playing
                </button>
                <button
                  type="button"
                  className={`leave-menu__btn ${step === "finish" ? "leave-menu__btn--danger" : "leave-menu__btn--primary"}`}
                  disabled={busy}
                  onClick={() => void endGame(step)}
                >
                  {step === "save" ? "Save and exit" : "Finish game"}
                </button>
              </div>
            </section>
          ) : (
            <section className="leave-menu__confirm" aria-labelledby={`${panelId}-title`}>
              <h2
                id={`${panelId}-title`}
                className="leave-menu__title"
                tabIndex={-1}
                ref={headingRef}
              >
                Leave game?
              </h2>
              {resigning ? (
                <>
                  {seats.length > 1 && (
                    <fieldset className="leave-menu__seats">
                      <legend className="leave-menu__hint">
                        Choose who resigns. The other players on this device stay in the game.
                      </legend>
                      {seats.map((seat) => (
                        <label
                          key={seat.id}
                          className={`leave-menu__seat${seat.id === choice?.id ? " leave-menu__seat--on" : ""}`}
                        >
                          <input
                            type="radio"
                            name={`${panelId}-seat`}
                            value={seat.id}
                            checked={seat.id === choice?.id}
                            disabled={busy}
                            onChange={() => setChosen(seat.id)}
                          />
                          <span
                            className="leave-menu__disc"
                            aria-hidden="true"
                            style={{ background: tokenLook(seat.token).cssColor }}
                          />
                          <span className="leave-menu__seat-name">{nameOf(seat)}</span>
                          <span className="leave-menu__tick" aria-hidden="true">
                            ✓
                          </span>
                        </label>
                      ))}
                    </fieldset>
                  )}
                  <p className="leave-menu__consequence">
                    {consequenceText(choice ? nameOf(choice) : null, activePlayers)}
                  </p>
                  <p className="leave-menu__hint" id={`${panelId}-note`}>
                    {auction
                      ? "Wait for the auction to end. Resigning is not possible while an auction runs."
                      : "Not possible while an auction runs. This can't be undone."}
                  </p>
                </>
              ) : (
                <p className="leave-menu__consequence">
                  {isFinished(game, state)
                    ? "The game is over."
                    : "You are not playing in this game now."}{" "}
                  You can leave the table.
                </p>
              )}
              <div className="leave-menu__actions">
                <button
                  type="button"
                  className="leave-menu__btn"
                  disabled={busy}
                  onClick={() => {
                    setError(null);
                    setStep("menu");
                  }}
                >
                  Stay
                </button>
                {resigning ? (
                  <button
                    type="button"
                    className="leave-menu__btn leave-menu__btn--primary"
                    disabled={busy || !choice || auction}
                    aria-describedby={`${panelId}-note`}
                    onClick={() => void resign()}
                  >
                    Resign
                  </button>
                ) : (
                  <button
                    type="button"
                    className="leave-menu__btn leave-menu__btn--primary"
                    onClick={leaveWithoutSeat}
                  >
                    Leave
                  </button>
                )}
              </div>
            </section>
          )}
          <p
            className={`leave-menu__status${error ? " leave-menu__status--error" : ""}`}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {status}
          </p>
        </div>
      )}
    </div>
  );
}
