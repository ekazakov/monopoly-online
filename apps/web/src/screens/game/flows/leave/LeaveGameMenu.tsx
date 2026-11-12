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
import { setSoundPreference, useSoundPreference } from "../../../../audio/soundPreference.ts";
import { tokenLook } from "../../../../scene/colors.ts";
import { setReducedMotion, useReducedMotion } from "../../../../styles/motionPreference.ts";
import { setThemePreference, useThemePreference } from "../../../../styles/themePreference.ts";
import type { ThemePreference } from "../../../../styles/themePreference.ts";
import {
  LANGUAGES,
  LANGUAGE_NAMES,
  setLanguagePreference,
  useLanguagePreference,
  useT,
} from "../../../../i18n/index.ts";
import type { LanguagePreference, MessageKey } from "../../../../i18n/index.ts";

const THEMES: ReadonlyArray<[ThemePreference, MessageKey]> = [
  ["system", "menu.theme.system"],
  ["light", "menu.theme.light"],
  ["dark", "menu.theme.dark"],
];
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
  const reducedMotion = useReducedMotion();
  const theme = useThemePreference();
  const language = useLanguagePreference();
  const t = useT();
  const sound = useSoundPreference();
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
      setError(cause instanceof Error ? cause.message : t("menu.resignFailed"));
      setSending(false);
      return;
    }
    setSending(false);
    if (seats.length > 1) {
      setNotice(t("menu.resigned", { name: nameOf(choice) }));
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
          : t(kind === "save" ? "menu.saveFailed" : "menu.finishFailed"),
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
    ? t("menu.resigning")
    : ending === "save"
      ? t("menu.saving")
      : ending === "finish"
        ? t("menu.finishing")
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
        {t("menu.title")}
      </button>
      {open && (
        <div id={panelId} className="leave-menu__panel" aria-busy={busy || undefined}>
          {step === "menu" ? (
            <>
              {isOwner && (
                <>
                  <div className="leave-menu__row">
                    <p className="leave-menu__row-text">
                      <span className="leave-menu__row-title">{t("menu.save.title")}</span>
                      <span className="leave-menu__hint">{t("menu.save.hint")}</span>
                    </p>
                    <button
                      type="button"
                      className="leave-menu__btn"
                      aria-label={t("menu.save.title")}
                      onClick={() => {
                        setError(null);
                        setNotice(null);
                        setStep("save");
                      }}
                    >
                      {t("menu.save.button")}
                    </button>
                  </div>
                  <div className="leave-menu__row">
                    <p className="leave-menu__row-text">
                      <span className="leave-menu__row-title">{t("menu.finish.title")}</span>
                      <span className="leave-menu__hint">{t("menu.finish.hint")}</span>
                    </p>
                    <button
                      type="button"
                      className="leave-menu__btn leave-menu__btn--danger"
                      aria-label={t("menu.finish.title")}
                      onClick={() => {
                        setError(null);
                        setNotice(null);
                        setStep("finish");
                      }}
                    >
                      {t("menu.finish.button")}
                    </button>
                  </div>
                </>
              )}
              <div className="leave-menu__row">
                <p className="leave-menu__row-text">
                  <span className="leave-menu__row-title">{t("menu.motion.title")}</span>
                  <span className="leave-menu__hint">{t("menu.motion.hint")}</span>
                </p>
                <button
                  type="button"
                  role="switch"
                  className="leave-menu__btn"
                  aria-label={t("menu.motion.title")}
                  aria-checked={reducedMotion}
                  onClick={() => setReducedMotion(!reducedMotion)}
                >
                  {reducedMotion ? t("menu.on") : t("menu.off")}
                </button>
              </div>
              <div className="leave-menu__row">
                <p className="leave-menu__row-text">
                  <span className="leave-menu__row-title" id={`${panelId}-theme`}>
                    {t("menu.theme")}
                  </span>
                  <span className="leave-menu__hint">{t("menu.theme.hint")}</span>
                </p>
                <div
                  className="leave-menu__choice"
                  role="group"
                  aria-labelledby={`${panelId}-theme`}
                >
                  {THEMES.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`leave-menu__btn${theme === value ? " leave-menu__btn--primary" : ""}`}
                      aria-pressed={theme === value}
                      onClick={() => setThemePreference(value)}
                    >
                      {t(label)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="leave-menu__row">
                <p className="leave-menu__row-text">
                  <span className="leave-menu__row-title" id={`${panelId}-language`}>
                    {t("menu.language")}
                  </span>
                  <span className="leave-menu__hint">{t("menu.language.hint")}</span>
                </p>
                <div
                  className="leave-menu__choice"
                  role="group"
                  aria-labelledby={`${panelId}-language`}
                >
                  {(["system", ...LANGUAGES] as const).map((value: LanguagePreference) => (
                    <button
                      key={value}
                      type="button"
                      className={`leave-menu__btn${language === value ? " leave-menu__btn--primary" : ""}`}
                      aria-pressed={language === value}
                      // a language name is in its own language, so a reader can find it
                      lang={value === "system" ? undefined : value}
                      onClick={() => setLanguagePreference(value)}
                    >
                      {value === "system" ? t("menu.language.system") : LANGUAGE_NAMES[value]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="leave-menu__row">
                <p className="leave-menu__row-text">
                  <span className="leave-menu__row-title">{t("menu.sound.title")}</span>
                  <span className="leave-menu__hint">{t("menu.sound.hint")}</span>
                </p>
                <button
                  type="button"
                  role="switch"
                  className="leave-menu__btn"
                  aria-label={t("menu.sound.title")}
                  aria-checked={sound.enabled}
                  onClick={() => setSoundPreference({ enabled: !sound.enabled })}
                >
                  {sound.enabled ? t("menu.on") : t("menu.off")}
                </button>
              </div>
              <label className="leave-menu__row leave-menu__volume">
                <span className="leave-menu__row-title">{t("menu.effects")}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(sound.effects * 100)}
                  disabled={!sound.enabled}
                  onChange={(event) =>
                    setSoundPreference({ effects: Number(event.target.value) / 100 })
                  }
                />
              </label>
              <label className="leave-menu__row leave-menu__volume">
                <span className="leave-menu__row-title">{t("menu.music")}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(sound.music * 100)}
                  disabled={!sound.enabled}
                  onChange={(event) =>
                    setSoundPreference({ music: Number(event.target.value) / 100 })
                  }
                />
              </label>
              <div className="leave-menu__row">
                <p className="leave-menu__row-text">
                  <span className="leave-menu__row-title">{t("menu.leave.title")}</span>
                  <span className="leave-menu__hint">
                    {seats.length > 1 ? t("menu.leave.hintSeats") : t("menu.leave.hint")}
                  </span>
                </p>
                <button
                  ref={leaveRef}
                  type="button"
                  className="leave-menu__btn leave-menu__btn--danger"
                  aria-label={t("menu.leave.title")}
                  onClick={openConfirm}
                >
                  {t("menu.leave.button")}
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
                {step === "save" ? t("menu.save.question") : t("menu.finish.question")}
              </h2>
              <p className="leave-menu__consequence">
                {step === "finish" && `${t("menu.noWinner")} `}
                {turnName ? t("menu.backToTurnOf", { name: turnName }) : t("menu.backToTurn")}
              </p>
              <p className="leave-menu__hint">
                {step === "save" ? t("menu.save.detail") : t("menu.finish.detail")}
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
                  {t("menu.keepPlaying")}
                </button>
                <button
                  type="button"
                  className={`leave-menu__btn ${step === "finish" ? "leave-menu__btn--danger" : "leave-menu__btn--primary"}`}
                  disabled={busy}
                  onClick={() => void endGame(step)}
                >
                  {step === "save" ? t("menu.save.title") : t("menu.finish.title")}
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
                {t("menu.leave.question")}
              </h2>
              {resigning ? (
                <>
                  {seats.length > 1 && (
                    <fieldset className="leave-menu__seats">
                      <legend className="leave-menu__hint">{t("menu.leave.choose")}</legend>
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
                    {consequenceText(choice ? nameOf(choice) : null, activePlayers, t)}
                  </p>
                  <p className="leave-menu__hint" id={`${panelId}-note`}>
                    {auction ? t("menu.leave.auctionWait") : t("menu.leave.undone")}
                  </p>
                </>
              ) : (
                <p className="leave-menu__consequence">
                  {isFinished(game, state) ? t("menu.leave.over") : t("menu.leave.notPlaying")}{" "}
                  {t("menu.leave.canLeave")}
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
                  {t("menu.stay")}
                </button>
                {resigning ? (
                  <button
                    type="button"
                    className="leave-menu__btn leave-menu__btn--primary"
                    disabled={busy || !choice || auction}
                    aria-describedby={`${panelId}-note`}
                    onClick={() => void resign()}
                  >
                    {t("menu.resign")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="leave-menu__btn leave-menu__btn--primary"
                    onClick={leaveWithoutSeat}
                  >
                    {t("menu.leave.button")}
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
