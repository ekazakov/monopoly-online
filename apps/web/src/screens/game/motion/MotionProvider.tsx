import type { ReactNode } from "react";
import { MotionContext, MotionReleaseContext, MotionSettledContext } from "./context.ts";
import { useMotionPlayer } from "./useMotionPlayer.ts";
import type { MotionListener } from "./useMotionPlayer.ts";

/** Plays the dice and token motion of the game in the store, and tells the views what plays. */
export function MotionProvider({
  children,
  listener,
}: {
  children: ReactNode;
  /** Hears the actions and steps, for example to play sounds. */
  listener?: MotionListener;
}) {
  const { playback, settledVersion, release } = useMotionPlayer(listener);
  return (
    <MotionContext value={playback}>
      <MotionSettledContext value={settledVersion}>
        <MotionReleaseContext value={release}>{children}</MotionReleaseContext>
      </MotionSettledContext>
    </MotionContext>
  );
}
