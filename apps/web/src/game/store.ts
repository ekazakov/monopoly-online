import type {
  ActionResponse,
  Game,
  GameEvent,
  RedactedGameState,
  StreamMessage,
} from "@monopoly/shared";

/** Events kept for the log. Older events are dropped and counted in `droppedEvents`. */
export const MAX_LOGGED_EVENTS = 2000;

export type GameStatus = "idle" | "loading" | "ready";
/** The state of the transport, set from outside by `setConnection`. */
export type ConnectionStatus = "connecting" | "open" | "reconnecting" | "closed";

export interface LoggedEvent {
  /** The engine version after the action that made the event. */
  version: number;
  event: GameEvent;
}

export interface GameStoreState {
  game: Game | null;
  /** The latest redacted state. The server state replaces it: there is no client reducer. */
  state: RedactedGameState | null;
  /** The version of `state`, or 0 when there is no state. */
  version: number;
  events: readonly LoggedEvent[];
  /** Events cut from the start of `events` by the cap. */
  droppedEvents: number;
  /** The events of the latest accepted action, for animations. Empty after a snapshot. */
  lastActionEvents: readonly GameEvent[];
  status: GameStatus;
  connection: ConnectionStatus;
  /** A `game.actions` message skipped a version. The UI may refetch the state. */
  gapDetected: boolean;
}

export const initialGameState: GameStoreState = {
  game: null,
  state: null,
  version: 0,
  events: [],
  droppedEvents: 0,
  lastActionEvents: [],
  status: "idle",
  connection: "closed",
  gapDetected: false,
};

/** `game:<uuid>` to the game id. */
const topicGameId = (topic: string) => topic.slice("game:".length);

function appendEvents(
  prev: GameStoreState,
  version: number,
  events: readonly GameEvent[],
): Pick<GameStoreState, "events" | "droppedEvents"> {
  const added = events.map((event) => ({ version, event }));
  const all = [...prev.events, ...added];
  const dropped = Math.max(0, all.length - MAX_LOGGED_EVENTS);
  return {
    events: dropped > 0 ? all.slice(dropped) : all,
    droppedEvents: prev.droppedEvents + dropped,
  };
}

function lastLoggedVersion(prev: GameStoreState): number {
  return prev.events[prev.events.length - 1]?.version ?? -1;
}

/** The server is the authority: a snapshot replaces the game and the state. */
function applySnapshot(
  prev: GameStoreState,
  game: Game,
  state: RedactedGameState | null,
): GameStoreState {
  const version = state?.version ?? 0;
  const sameGame = prev.game?.id === game.id;
  const keepLog = sameGame && version >= prev.version;
  const sameVersion = keepLog && version === prev.version;
  return {
    ...prev,
    game,
    state,
    version,
    events: keepLog ? prev.events : [],
    droppedEvents: keepLog ? prev.droppedEvents : 0,
    lastActionEvents: sameVersion ? prev.lastActionEvents : [],
    status: "ready",
    gapDetected: false,
  };
}

/**
 * Take a newer state with the events that made it. Older and repeated versions change nothing.
 * `eventsVersion` is the version of the action that made `events`: for a repeated
 * `clientActionId` it is lower than `state.version`.
 */
function applyNewerState(
  prev: GameStoreState,
  state: RedactedGameState,
  eventsVersion: number,
  events: readonly GameEvent[],
): GameStoreState {
  if (state.version <= prev.version) return prev;
  const fresh = eventsVersion > lastLoggedVersion(prev);
  return {
    ...prev,
    state,
    version: state.version,
    ...(fresh ? appendEvents(prev, eventsVersion, events) : {}),
    lastActionEvents: fresh && eventsVersion === state.version ? events : [],
    gapDetected: prev.gapDetected || state.version > prev.version + 1,
  };
}

export function applyStreamMessage(prev: GameStoreState, message: StreamMessage): GameStoreState {
  const gameId = topicGameId(message.topic);
  if (message.type === "snapshot") {
    return applySnapshot(prev, message.payload.game, message.payload.state);
  }
  // A message of another game, for example a late one after the user left for another room.
  if (prev.game && prev.game.id !== gameId) return prev;
  if (message.type === "room.updated") {
    return { ...prev, game: message.payload.game, status: "ready" };
  }
  // The game is gone. The screen handles it in the Cancel game flow (milestone 2, G6).
  if (message.type === "room.cancelled") return prev;
  // The lobby and user topics are not part of a game. Another store reads them (G3).
  if (message.type !== "game.actions") return prev;
  const { state, events } = message.payload;
  return applyNewerState(prev, state, state.version, events);
}

export function applyActionResponse(
  prev: GameStoreState,
  response: ActionResponse,
): GameStoreState {
  return applyNewerState(prev, response.state, response.version, response.events);
}

/** The response of `GET /api/games/:id/state`. It has no events. A state that is not older clears the gap. */
export function applyStateResponse(
  prev: GameStoreState,
  response: { version: number; state: RedactedGameState },
): GameStoreState {
  if (response.state.version < prev.version) return prev;
  // The first state may be the one at version 0, which `applyNewerState` takes for a repeat.
  if (!prev.state) {
    return { ...prev, state: response.state, version: response.state.version, gapDetected: false };
  }
  const next = applyNewerState(prev, response.state, response.state.version, []);
  return next.gapDetected ? { ...next, gapDetected: false } : next;
}

/** The response of `POST /api/games/:id/start` is a snapshot at version 0. */
export function applyStartResponse(
  prev: GameStoreState,
  response: { game: Game; state: RedactedGameState },
): GameStoreState {
  return applySnapshot(prev, response.game, response.state);
}

/** The response of `GET /api/games/:id`. A room older than the one in the store is ignored. */
export function applyRoomResponse(prev: GameStoreState, game: Game): GameStoreState {
  if (prev.game?.id === game.id && prev.game.version > game.version) return prev;
  return { ...prev, game, status: "ready" };
}

/** A new game id resets the store. The connection stays. */
export function resetGame(prev: GameStoreState): GameStoreState {
  return { ...initialGameState, connection: prev.connection };
}

export interface GameStore {
  getState: () => GameStoreState;
  subscribe: (listener: () => void) => () => void;
  applyStreamMessage: (message: StreamMessage) => void;
  applyActionResponse: (response: ActionResponse) => void;
  applyStateResponse: (response: { version: number; state: RedactedGameState }) => void;
  applyStartResponse: (response: { game: Game; state: RedactedGameState }) => void;
  applyRoomResponse: (game: Game) => void;
  setConnection: (connection: ConnectionStatus) => void;
  /** The first load of a game started. A game that is ready stays ready. */
  setLoading: () => void;
  /** The UI handled the gap, for example it refetched the state. */
  clearGap: () => void;
  reset: () => void;
}

/** A small external store for `useSyncExternalStore`. */
export function createGameStore(initial: GameStoreState = initialGameState): GameStore {
  let current = initial;
  const listeners = new Set<() => void>();

  // Keep the same object when nothing changed, so no listener runs.
  const update = (fn: (prev: GameStoreState) => GameStoreState) => {
    const next = fn(current);
    if (next === current) return;
    current = next;
    for (const listener of [...listeners]) listener();
  };

  return {
    getState: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    applyStreamMessage: (message) => update((prev) => applyStreamMessage(prev, message)),
    applyActionResponse: (response) => update((prev) => applyActionResponse(prev, response)),
    applyStateResponse: (response) => update((prev) => applyStateResponse(prev, response)),
    applyStartResponse: (response) => update((prev) => applyStartResponse(prev, response)),
    applyRoomResponse: (game) => update((prev) => applyRoomResponse(prev, game)),
    setConnection: (connection) =>
      update((prev) => (prev.connection === connection ? prev : { ...prev, connection })),
    setLoading: () =>
      update((prev) => (prev.status === "idle" ? { ...prev, status: "loading" } : prev)),
    clearGap: () => update((prev) => (prev.gapDetected ? { ...prev, gapDetected: false } : prev)),
    reset: () => update(resetGame),
  };
}
