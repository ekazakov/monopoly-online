import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useReducer } from "react";
import type { StreamMessage } from "@monopoly/shared";
import { listMyGames } from "../../api/lobby.ts";
import { useRealtimeStatus, useTopic } from "../../realtime/index.ts";
import { initialLobbyState, lobbyReducer } from "./lobbyModel.ts";

export const myGamesQuery = queryOptions({
  queryKey: ["me", "games"],
  queryFn: listMyGames,
  retry: false,
});

/**
 * The live lobby: the open games from the `lobby` topic and the invites from `user:<id>`. Both
 * topics send the full list on each connect, so a reconnect needs no extra code. My games has no
 * topic, so any lobby change makes it fetch again.
 */
export function useLobby(userId: string) {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(lobbyReducer, initialLobbyState);

  const onMessage = useCallback(
    (message: StreamMessage) => {
      dispatch(message);
      if (message.type !== "lobby.snapshot") {
        void queryClient.invalidateQueries({ queryKey: myGamesQuery.queryKey });
      }
    },
    [queryClient],
  );
  useTopic("lobby", onMessage);
  useTopic(`user:${userId}`, onMessage);

  const myGames = useQuery(myGamesQuery);
  const status = useRealtimeStatus();
  return { ...state, myGames, reconnecting: status === "reconnecting" };
}
