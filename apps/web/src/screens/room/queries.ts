import { queryOptions } from "@tanstack/react-query";
import { getGame } from "../../api/index.ts";

export const roomKey = (gameId: string) => ["rooms", gameId] as const;

// One cache entry per room. Stream messages and action answers replace it with `setQueryData`.
export const roomQuery = (gameId: string) =>
  queryOptions({
    queryKey: roomKey(gameId),
    queryFn: () => getGame(gameId),
    retry: false,
  });
