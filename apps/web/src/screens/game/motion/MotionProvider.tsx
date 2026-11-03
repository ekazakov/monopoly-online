import type { ReactNode } from "react";
import { MotionContext } from "./context.ts";
import { useMotionPlayer } from "./useMotionPlayer.ts";

/** Plays the dice and token motion of the game in the store, and tells the views which step it is. */
export function MotionProvider({ children }: { children: ReactNode }) {
  const step = useMotionPlayer();
  return <MotionContext value={step}>{children}</MotionContext>;
}
