import { queryOptions } from "@tanstack/react-query";
import { getGame, getResult, getState } from "../api/index.ts";
import type { GameStore } from "./store.ts";

// The answer goes into the store as it arrives, so a refetch (a gap, a version conflict, a focus
// return) needs no extra code. `gcTime: 0` keeps an old answer from filling a later store.
export const gameRoomQuery = (store: GameStore, gameId: string) =>
  queryOptions({
    queryKey: ["games", gameId, "room"],
    queryFn: async () => {
      const game = await getGame(gameId);
      store.applyRoomResponse(game);
      return game;
    },
    gcTime: 0,
    retry: false,
  });

export const gameStateQuery = (store: GameStore, gameId: string, enabled: boolean) =>
  queryOptions({
    queryKey: ["games", gameId, "state"],
    queryFn: async () => {
      const response = await getState(gameId);
      store.applyStateResponse(response);
      return response;
    },
    enabled,
    gcTime: 0,
    retry: false,
  });

// The result of a finished game never changes, but `gcTime: 0` keeps the screen honest after a
// retry. A failure is not retried by itself: the screen offers "Try again".
export const gameResultQuery = (gameId: string) =>
  queryOptions({
    queryKey: ["games", gameId, "result"],
    queryFn: () => getResult(gameId),
    gcTime: 0,
    retry: false,
  });
