import { ApiError } from "../../api.ts";

/** A message above the lists: the answer to a join or an accept that did not work. */
export interface LobbyNotice {
  title: string;
  text: string;
}

/**
 * The notice for a failed join, accept or decline. The "full" copy is from the LobbyStates board
 * ("Join, game filled meanwhile"). `game_not_waiting` reads the same: the game left the list.
 */
export function noticeFor(
  error: unknown,
  action: "join" | "accept" | "decline" | "continue" | "finish",
): LobbyNotice {
  if (error instanceof ApiError) {
    if (error.code === "game_full" || error.code === "game_not_waiting") {
      return {
        title: "This game is full",
        text: "The last seat went while you were joining. Pick another game.",
      };
    }
    if (error.code === "seat_name_taken") {
      return {
        title: "Your name is taken in this game",
        text: "A seat in this game has your name. Pick another game.",
      };
    }
    if (error.code === "not_found") {
      return {
        title: "This game is gone",
        text: "The host cancelled it, or the invite is no longer valid.",
      };
    }
  }
  if (action === "continue" || action === "finish") {
    if (
      error instanceof ApiError &&
      (error.code === "game_not_saved" || error.code === "game_not_active")
    ) {
      return {
        title: "This game has changed",
        text: "It is not saved any more. Check My games.",
      };
    }
    return { title: `Could not ${action} the game`, text: "Try again." };
  }
  const what = action === "join" ? "join the game" : `${action} the invite`;
  return { title: `Could not ${what}`, text: "Try again." };
}
