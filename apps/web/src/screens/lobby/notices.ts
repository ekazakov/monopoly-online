import { ApiError } from "../../api.ts";
import type { Translate } from "../../i18n/index.ts";

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
  t: Translate,
): LobbyNotice {
  if (error instanceof ApiError) {
    if (error.code === "game_full" || error.code === "game_not_waiting") {
      return {
        title: t("lobby.notice.full.title"),
        text: t("lobby.notice.full.text"),
      };
    }
    if (error.code === "seat_name_taken") {
      return {
        title: t("lobby.notice.nameTaken.title"),
        text: t("lobby.notice.nameTaken.text"),
      };
    }
    if (error.code === "not_found") {
      return {
        title: t("lobby.notice.gone.title"),
        text: t("lobby.notice.gone.text"),
      };
    }
  }
  if (action === "continue" || action === "finish") {
    if (
      error instanceof ApiError &&
      (error.code === "game_not_saved" || error.code === "game_not_active")
    ) {
      return {
        title: t("lobby.notice.changed.title"),
        text: t("lobby.notice.changed.text"),
      };
    }
    return { title: t(`lobby.notice.failed.${action}`), text: t("lobby.notice.tryAgain") };
  }
  return { title: t(`lobby.notice.failed.${action}`), text: t("lobby.notice.tryAgain") };
}
