import { useContext, useRef, useState, useSyncExternalStore } from "react";
import type { ActionType } from "@monopoly/game-engine";
import type { Game, Phase, RedactedGameState, Seat } from "@monopoly/shared";
import { GameStoreContext } from "./context.ts";
import {
  actingSeat,
  currentPlayer,
  isFinished,
  isHotSeatHandoff,
  isMyTurn,
  mayAct,
  mySeats,
  phase,
  winner,
} from "./selectors.ts";
import type { GameStore, GameStoreState } from "./store.ts";

export function useGameStore(): GameStore {
  const store = useContext(GameStoreContext);
  if (!store) throw new Error("useGameStore needs a GameStoreProvider");
  return store;
}

/**
 * Read a part of the store. `selector` must be pure. The result is kept while the store state and
 * the selector are the same, and while `isEqual` says the new result equals the old one, so a
 * selector that builds an array or an object does not cause a loop or a render for nothing.
 */
export function useGameSelector<T>(
  selector: (state: GameStoreState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const store = useGameStore();
  const cache = useRef<{
    state: GameStoreState;
    selector: typeof selector;
    selected: T;
  } | null>(null);

  const getSnapshot = () => {
    const state = store.getState();
    const cached = cache.current;
    if (cached?.state === state && cached.selector === selector) return cached.selected;
    const selected = selector(state);
    const result = cached && isEqual(cached.selected, selected) ? cached.selected : selected;
    cache.current = { state, selector, selected: result };
    return result;
  };

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

/** The whole store state. */
export function useGameSnapshot(): GameStoreState {
  return useGameSelector((state) => state);
}

const sameSeats = (a: readonly Seat[], b: readonly Seat[]) =>
  a.length === b.length && a.every((seat, i) => seat === b[i]);

export interface GameView extends GameStoreState {
  phase: Phase | null;
  currentPlayer: RedactedGameState["players"][number] | null;
  mySeats: Seat[];
  actingSeat: Seat | null;
  isMyTurn: boolean;
  isFinished: boolean;
  winner: RedactedGameState["players"][number] | null;
}

/** The store state with the selectors applied for the signed-in user. */
export function useGame(userId: string | null): GameView {
  const snapshot = useGameSnapshot();
  const { game, state } = snapshot;
  // Seat objects come from `game`, so they stay the same until the room changes.
  const seats = useGameSelector((s) => mySeats(s.game, userId), sameSeats);
  return {
    ...snapshot,
    phase: phase(state),
    currentPlayer: currentPlayer(state),
    mySeats: seats,
    actingSeat: actingSeat(game, state),
    isMyTurn: isMyTurn(game, state, userId),
    isFinished: isFinished(game, state),
    winner: winner(state),
  };
}

/** Whether the user may do the action now with one of their seats. */
export function useMayAct(userId: string | null, type?: ActionType): boolean {
  return useGameSelector((s) => mayAct(s.game, s.state, userId, type));
}

export function useGameRoom(): Game | null {
  return useGameSelector((s) => s.game);
}

/**
 * The seat to hand the device to, or null. It is set when the acting seat changes to another
 * seat of this device, and cleared by `confirm` (the "Pass to <name>" button).
 */
export function useHotSeatHandoff(userId: string | null): {
  pending: Seat | null;
  confirm: () => void;
} {
  const { game, state } = useGameSnapshot();
  const acting = actingSeat(game, state);
  const [previous, setPrevious] = useState(acting);
  const [pending, setPending] = useState<Seat | null>(null);

  if (acting?.id !== previous?.id) {
    setPrevious(acting);
    setPending(isHotSeatHandoff(previous, acting, mySeats(game, userId)) ? acting : null);
  }

  return { pending, confirm: () => setPending(null) };
}
