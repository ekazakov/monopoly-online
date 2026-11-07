import { queryOptions } from "@tanstack/react-query";
import { getGame } from "../../api/index.ts";

export const roomKey = (gameId: string) => ["rooms", gameId] as const;

// One cache entry per room. Stream messages and action answers replace it with `setQueryData`.
export const roomQuery = (gameId: string) =>
  queryOptions({
    queryKey: roomKey(gameId),
    queryFn: () => getGame(gameId),
    // The room is not kept after the screen goes. A copy from before a save would still say
    // `active`: the room sends the player to the table, the table sends them back to the room, and
    // the two redirects repeat until the tab freezes.
    gcTime: 0,
    retry: false,
  });
