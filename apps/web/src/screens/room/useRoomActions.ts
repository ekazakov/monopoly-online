import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Game, Token } from "@monopoly/shared";
import {
  addHotSeat,
  cancelGame,
  changeToken,
  inviteByName,
  joinGame,
  leaveGame,
  removeSeat,
  startGame,
} from "../../api/index.ts";
import { claimSeats, restoreGame } from "../../api/games.ts";
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
    // No cache write: the game is gone, and the screen leaves or shows the cancelled notice.
    cancel: useMutation({ mutationFn: () => cancelGame(gameId) }),
    invite: useMutation({
      mutationFn: (name: string) => inviteByName(gameId, name),
      onSuccess: replace,
    }),
    pickToken: useMutation({
      mutationFn: ({ seatId, token }: { seatId: string; token: Token }) =>
        changeToken(gameId, seatId, token),
      onSuccess: replace,
    }),
    // Claim and Restore return the game as it is after the change. Restore also changes the status,
    // so the room moves on to the play screen.
    claim: useMutation({ mutationFn: () => claimSeats(gameId), onSuccess: replace }),
    restore: useMutation({ mutationFn: () => restoreGame(gameId), onSuccess: replace }),
    start: useMutation({
      mutationFn: () => startGame(gameId),
      onSuccess: (response) => replace(response.game),
    }),
  };
}
