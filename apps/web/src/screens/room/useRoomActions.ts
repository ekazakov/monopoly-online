import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Game, Token } from "@monopoly/shared";
import {
  addHotSeat,
  changeToken,
  joinGame,
  leaveGame,
  removeSeat,
  startGame,
} from "../../api/index.ts";
import { roomKey } from "./queries.ts";

// Each room change answers with the new room, which replaces the cached one.
export function useRoomActions(gameId: string) {
  const queryClient = useQueryClient();
  const replace = (game: Game) => queryClient.setQueryData(roomKey(gameId), game);
  const reload = () => queryClient.invalidateQueries({ queryKey: roomKey(gameId) });

  return {
    reload,
    join: useMutation({ mutationFn: () => joinGame(gameId), onSuccess: replace }),
    // No cache write: the screen is leaving, and the room would flip to a visitor view first.
    leave: useMutation({ mutationFn: () => leaveGame(gameId) }),
    add: useMutation({
      mutationFn: (name: string) => addHotSeat(gameId, name),
      onSuccess: replace,
    }),
    remove: useMutation({
      mutationFn: (seatId: string) => removeSeat(gameId, seatId),
      onSuccess: replace,
    }),
    pickToken: useMutation({
      mutationFn: ({ seatId, token }: { seatId: string; token: Token }) =>
        changeToken(gameId, seatId, token),
      onSuccess: replace,
    }),
    start: useMutation({
      mutationFn: () => startGame(gameId),
      onSuccess: (response) => replace(response.game),
    }),
  };
}
