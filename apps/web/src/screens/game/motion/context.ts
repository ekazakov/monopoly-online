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
