import type { ReactNode } from "react";
import { MotionContext, MotionReleaseContext } from "./context.ts";
import { useMotionPlayer } from "./useMotionPlayer.ts";

/** Plays the dice and token motion of the game in the store, and tells the views what plays. */
export function MotionProvider({ children }: { children: ReactNode }) {
  const { playback, release } = useMotionPlayer();
  return (
    <MotionContext value={playback}>
      <MotionReleaseContext value={release}>{children}</MotionReleaseContext>
    </MotionContext>
  );
}
