import { useCallback, useEffect, useRef, useState } from "react";
import { useGameSnapshot } from "../../../game/index.ts";
import { createMotionQueue, stepDuration } from "../../../scene/motion.ts";
import type { MotionStep } from "../../../scene/motion.ts";

/**
 * Plays the motion of the latest actions one step after the other, and returns the step that plays
 * now (or null).
 *
 * Source: `lastActionEvents` of the store, which holds the events of the latest accepted action.
 * Rule for a player that mounts later than an action (as in `useCardNotice`): only an action newer
 * than the version at mount makes motion. What was already there is on screen at once.
 *
 * Only the dice roll plays so far. The token steps are dropped until the tokens animate.
 */
export function useMotionPlayer(): MotionStep | null {
  const { version, lastActionEvents } = useGameSnapshot();
  const [mountVersion] = useState(version);
  const [queue] = useState(createMotionQueue);
  const [current, setCurrent] = useState<MotionStep | null>(null);
  const seen = useRef(mountVersion);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const advance = useCallback(
    function advance() {
      let step = queue.next();
      while (step && step.kind !== "roll") step = queue.next();
      setCurrent(step ?? null);
      timer.current = step ? setTimeout(advance, stepDuration(step)) : undefined;
    },
    [queue],
  );

  useEffect(() => {
    if (version <= seen.current) return;
    seen.current = version;
    queue.push(lastActionEvents);
    if (timer.current === undefined) advance();
  }, [version, lastActionEvents, queue, advance]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return current;
}
