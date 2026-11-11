import { useCallback, useEffect, useRef, useState } from "react";
import type { GameEvent, RedactedGameState } from "@monopoly/shared";
import { useGameSnapshot, useGameStore } from "../../../game/index.ts";
import type { ConnectionStatus } from "../../../game/index.ts";
import { IDLE_PLAYBACK, createMotionQueue, stepDuration } from "../../../scene/motion.ts";
import type { MotionPlayback, MotionStep } from "../../../scene/motion.ts";
import { useReducedMotion } from "../../../styles/motionPreference.ts";

/**
 * Actions that come this long after the stream reopens are the replay of what the device missed.
 * The server sends the replay as soon as the stream opens.
 */
export const REPLAY_WINDOW_MS = 1000;

/**
 * Hears what the player does, for example to play sounds in time with the motion.
 * - `onAction`: a live action came, with the state after it. Its steps are in the queue now.
 * - `onStep`: a step starts to play.
 * - `onIdle`: the queue is empty after live actions, so their result is on screen.
 * - `onSettle`: news that is not a live action put the tokens on their squares at once. It
 *   has the new state.
 */
export interface MotionListener {
  onAction?: (events: readonly GameEvent[], state: RedactedGameState | null) => void;
  onStep?: (step: MotionStep) => void;
  onIdle?: () => void;
  onSettle?: (state: RedactedGameState | null) => void;
}

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
 *   play one after the other when the user comes back, and
 * - any action under reduced motion: no dice roll, no hops, the result shows at once.
 *
 * A drawn card that moves the token is a hold step: the player stops on it with no timer and waits
 * for `release()` (OK on the card). A new action, a snapshot or a reconnect during a hold settles
 * it. Under reduced motion the moves still show at once, but a hold waits for OK too, with the
 * token on the card square.
 */
export function useMotionPlayer(listener?: MotionListener): {
  playback: MotionPlayback;
  release: () => void;
} {
  const store = useGameStore();
  const { version, lastActionEvents, state } = useGameSnapshot();
  const [mountVersion] = useState(version);
  const [queue] = useState(createMotionQueue);
  const [playback, setPlayback] = useState<MotionPlayback>(IDLE_PLAYBACK);
  const seen = useRef(mountVersion);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastConnection = useRef<ConnectionStatus>(store.getState().connection);
  const down = useRef(false);
  const replayUntil = useRef(0);
  const reduced = useReducedMotion();
  const reducedNow = useRef(reduced);
  const holding = useRef(false);
  const hears = useRef(listener);

  const advance = useCallback(
    function advance() {
      let step = queue.next() ?? null;
      // Reduced motion: no roll and no hop. Only a hold is left to wait for.
      while (reducedNow.current && step && step.kind !== "hold") step = queue.next() ?? null;
      holding.current = step?.kind === "hold";
      setPlayback(step ? { current: step, waiting: queue.pending() } : IDLE_PLAYBACK);
      timer.current =
        step && !holding.current ? setTimeout(advance, stepDuration(step)) : undefined;
      if (step) hears.current?.onStep?.(step);
      else hears.current?.onIdle?.();
    },
    [queue],
  );

  const settle = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    holding.current = false;
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
    hears.current = listener;
  }, [listener]);

  // Reduced motion that starts while steps play: the step that plays ends, and `advance` drops the rest.
  useEffect(() => {
    reducedNow.current = reduced;
  }, [reduced]);

  useEffect(() => {
    if (version <= seen.current) return;
    seen.current = version;
    const replay = down.current || Date.now() < replayUntil.current;
    // The news ends a hold: the card of the old action is not the one to wait for. The queue
    // starts again below (or settles), so the playback needs no update here.
    if (holding.current) {
      holding.current = false;
      queue.clear();
    }
    const live = lastActionEvents.length > 0 && !replay && !document.hidden;
    if (live) {
      queue.push(lastActionEvents);
      hears.current?.onAction?.(lastActionEvents, state);
    }
    if (!live || (reduced && !queue.pending().some((step) => step.kind === "hold"))) {
      settle();
      // A live action with no motion to show has its result on screen now.
      if (live) hears.current?.onIdle?.();
      else hears.current?.onSettle?.(state);
      return;
    }
    if (timer.current === undefined) advance();
    else setPlayback((prev) => ({ current: prev.current, waiting: queue.pending() }));
  }, [version, lastActionEvents, state, queue, advance, settle, reduced]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const release = useCallback(() => {
    if (holding.current) advance();
  }, [advance]);

  return { playback, release };
}
