import { useCallback, useEffect, useRef, useState } from "react";
import { useGameSnapshot } from "../../../game/index.ts";
import { IDLE_PLAYBACK, createMotionQueue, stepDuration } from "../../../scene/motion.ts";
import type { MotionPlayback } from "../../../scene/motion.ts";

/**
 * Plays the motion of the latest actions one step after the other, and returns the step that
 * plays now with the steps that wait.
 *
 * Source: `lastActionEvents` of the store, which holds the events of the latest accepted action.
 * Rule for a player that mounts later than an action (as in `useCardNotice`): only an action newer
 * than the version at mount makes motion. What was already there is on screen at once.
 */
export function useMotionPlayer(): MotionPlayback {
  const { version, lastActionEvents } = useGameSnapshot();
  const [mountVersion] = useState(version);
  const [queue] = useState(createMotionQueue);
  const [playback, setPlayback] = useState<MotionPlayback>(IDLE_PLAYBACK);
  const seen = useRef(mountVersion);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const advance = useCallback(
    function advance() {
      const step = queue.next() ?? null;
      setPlayback(step ? { current: step, waiting: queue.pending() } : IDLE_PLAYBACK);
      timer.current = step ? setTimeout(advance, stepDuration(step)) : undefined;
    },
    [queue],
  );

  useEffect(() => {
    if (version <= seen.current) return;
    seen.current = version;
    queue.push(lastActionEvents);
    if (timer.current === undefined) advance();
    else setPlayback((prev) => ({ current: prev.current, waiting: queue.pending() }));
  }, [version, lastActionEvents, queue, advance]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return playback;
}
