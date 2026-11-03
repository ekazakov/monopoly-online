import { useCallback, useEffect, useRef, useState } from "react";
import { useGameSnapshot, useGameStore } from "../../../game/index.ts";
import type { ConnectionStatus } from "../../../game/index.ts";
import { IDLE_PLAYBACK, createMotionQueue, stepDuration } from "../../../scene/motion.ts";
import type { MotionPlayback } from "../../../scene/motion.ts";

/**
 * Actions that come this long after the stream reopens are the replay of what the device missed.
 * The server sends the replay as soon as the stream opens.
 */
export const REPLAY_WINDOW_MS = 1000;

/**
 * Plays the motion of the latest actions one step after the other, and returns the step that
 * plays now with the steps that wait.
 *
 * Source: `lastActionEvents` of the store, which holds the events of the latest accepted action.
 * Rule for a player that mounts later than an action (as in `useCardNotice`): only an action newer
 * than the version at mount makes motion. What was already there is on screen at once.
 *
 * Some news is not a live action, and then the player settles: it drops the steps that wait and
 * stops the one that plays, so the tokens stand on the squares of the state at once. That is the
 * case for
 * - a newer state with no events (a snapshot, or a state read again after a gap),
 * - the replay after a reconnect (`REPLAY_WINDOW_MS`), and
 * - an action that comes while the tab is hidden, because nobody watches it and the steps would
 *   play one after the other when the user comes back.
 */
export function useMotionPlayer(): MotionPlayback {
  const store = useGameStore();
  const { version, lastActionEvents } = useGameSnapshot();
  const [mountVersion] = useState(version);
  const [queue] = useState(createMotionQueue);
  const [playback, setPlayback] = useState<MotionPlayback>(IDLE_PLAYBACK);
  const seen = useRef(mountVersion);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastConnection = useRef<ConnectionStatus>(store.getState().connection);
  const down = useRef(false);
  const replayUntil = useRef(0);

  const advance = useCallback(
    function advance() {
      const step = queue.next() ?? null;
      setPlayback(step ? { current: step, waiting: queue.pending() } : IDLE_PLAYBACK);
      timer.current = step ? setTimeout(advance, stepDuration(step)) : undefined;
    },
    [queue],
  );

  const settle = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    queue.clear();
    setPlayback(IDLE_PLAYBACK);
  }, [queue]);

  // The store is watched directly, because a render does not see every change of the connection.
  useEffect(() => {
    const check = () => {
      const now = store.getState().connection;
      const before = lastConnection.current;
      lastConnection.current = now;
      if (now === "reconnecting" || (before === "open" && now === "closed")) {
        down.current = true;
      } else if (now === "open" && down.current) {
        down.current = false;
        replayUntil.current = Date.now() + REPLAY_WINDOW_MS;
      }
    };
    return store.subscribe(check);
  }, [store]);

  useEffect(() => {
    if (version <= seen.current) return;
    seen.current = version;
    const replay = down.current || Date.now() < replayUntil.current;
    if (lastActionEvents.length === 0 || replay || document.hidden) {
      settle();
      return;
    }
    queue.push(lastActionEvents);
    if (timer.current === undefined) advance();
    else setPlayback((prev) => ({ current: prev.current, waiting: queue.pending() }));
  }, [version, lastActionEvents, queue, advance, settle]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return playback;
}
