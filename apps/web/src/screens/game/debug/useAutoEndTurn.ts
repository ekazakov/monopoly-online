import { useEffect, useRef } from "react";
import { useMotionSettledVersion, useMotionStep } from "../motion/index.ts";
import { useTurn } from "../turn/useTurn.ts";
import { useAutoEndTurnPreference } from "./autoEndTurnPreference.ts";

/** The pause after the last result, so the tester sees it before the next turn. */
export const AUTO_END_DELAY_MS = 400;

/**
 * Debug mode: sends `EndTurn` for the player on turn when nothing is left to do. That is the phase
 * `awaiting_end_turn`, so a buy decision, an auction, a debt or a jail choice must finish first.
 * It also waits for the dice and token motion and for OK on a drawn card (`cardOpen`).
 *
 * Only the device that controls the seat on turn sends. It sends once for each version.
 */
export function useAutoEndTurn(userId: string, debug: boolean, cardOpen: boolean): void {
  const enabled = useAutoEndTurnPreference();
  const turn = useTurn(userId);
  const step = useMotionStep();
  const settledVersion = useMotionSettledVersion();
  const sentFor = useRef<number | null>(null);

  const { version, state } = turn.view;
  const ready =
    debug &&
    enabled &&
    state?.turn.phase === "awaiting_end_turn" &&
    turn.can("EndTurn") &&
    step === null &&
    settledVersion >= version &&
    !cardOpen;

  // The latest `send`, so the timer does not restart when the turn object changes.
  const send = useRef(turn.send);
  useEffect(() => {
    send.current = turn.send;
  });

  useEffect(() => {
    if (!ready || sentFor.current === version) return;
    const timer = setTimeout(() => {
      // Set here and not when the timer starts: a cleanup (StrictMode, a new render) clears the
      // timer, and the next run must still send.
      sentFor.current = version;
      send.current({ type: "EndTurn" });
    }, AUTO_END_DELAY_MS);
    return () => clearTimeout(timer);
  }, [ready, version]);
}
