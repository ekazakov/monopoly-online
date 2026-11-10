import { createContext, useContext } from "react";
import { IDLE_PLAYBACK } from "../../../scene/motion.ts";
import type { MotionPlayback, MotionStep } from "../../../scene/motion.ts";

/** What plays now and what waits. Without a provider nothing plays, so a view shows its end state. */
export const MotionContext = createContext<MotionPlayback>(IDLE_PLAYBACK);

export function useMotionPlayback(): MotionPlayback {
  return useContext(MotionContext);
}

/** The step that plays now, or null. */
export function useMotionStep(): MotionStep | null {
  return useContext(MotionContext).current;
}

/** Ends the hold of a drawn card, so the token moves on. It does nothing when no hold waits. */
export const MotionReleaseContext = createContext<() => void>(() => {});

export function useMotionRelease(): () => void {
  return useContext(MotionReleaseContext);
}
