import type { Invite, LobbyGame, StreamMessage } from "@monopoly/shared";

/** The open games list is at most this long, as on the server. */
export const OPEN_GAMES_LIMIT = 50;

/**
 * What the `lobby` and `user:<id>` topics show. `null` means that the first full list has not
 * arrived yet, which is not the same as an empty list.
 */
export interface LobbyState {
  games: LobbyGame[] | null;
  invites: Invite[] | null;
}

export const initialLobbyState: LobbyState = { games: null, invites: null };

// Newest first. The id breaks a tie of equal times, as on the server.
const newestFirst = (a: LobbyGame, b: LobbyGame) =>
  a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1;

/** Applies one stream message. A message of another kind returns the same state. */
export function lobbyReducer(state: LobbyState, message: StreamMessage): LobbyState {
  switch (message.type) {
    case "lobby.snapshot":
      return { ...state, games: message.payload.games };
    case "lobby.updated": {
      // The full list always comes first on a connect. An update before it would show a partial
      // list as the whole list.
      if (state.games === null) return state;
      const { game } = message.payload;
      const games = [...state.games.filter((g) => g.id !== game.id), game]
        .sort(newestFirst)
        .slice(0, OPEN_GAMES_LIMIT);
      return { ...state, games };
    }
    case "lobby.removed":
      if (state.games === null) return state;
      return { ...state, games: state.games.filter((g) => g.id !== message.payload.gameId) };
    case "invites.updated":
      return { ...state, invites: message.payload.invites };
    default:
      return state;
  }
}
