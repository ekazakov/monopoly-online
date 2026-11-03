import { createContext, useContext } from "react";
import type { MotionStep } from "../../../scene/motion.ts";

/** The step that plays now, or null. Without a provider nothing plays, so a view shows its end state. */
export const MotionContext = createContext<MotionStep | null>(null);

export function useMotionStep(): MotionStep | null {
  return useContext(MotionContext);
}
