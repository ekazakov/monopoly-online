import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { isApiError } from "../api/index.ts";
import { useT } from "../i18n/index.ts";
import { useSession } from "../session/index.ts";
import { NotFoundScreen } from "./NotFoundScreen.tsx";
import { Room } from "./room/Room.tsx";
import { roomQuery } from "./room/queries.ts";

const route = getRouteApi("/games/$gameId");

// The invite page: a seated player sees the waiting room, anyone else sees it read-only with Join.
export function RoomScreen() {
  const t = useT();
  const { gameId } = route.useParams();
  const { data: user } = useSession();
  const room = useQuery(roomQuery(gameId));

  if (room.isPending || !user) {
    return (
      <main className="screen" role="status">
        <h1>{t("roomScreen.loading")}</h1>
      </main>
    );
  }
  if (room.isError) {
    if (isApiError(room.error, "not_found")) return <NotFoundScreen />;
    if (isApiError(room.error, "not_a_member")) {
      return (
        <main className="screen" role="alert">
          <h1>{t("room.notYours.title")}</h1>
          <p>{t("room.notYours.text")}</p>
        </main>
      );
    }
    return (
      <main className="screen" role="alert">
        <h1>{t("roomScreen.failed")}</h1>
        <p>{room.error.message}</p>
        <button type="button" onClick={() => void room.refetch()}>
          {t("roomScreen.retry")}
        </button>
      </main>
    );
  }
  return <Room game={room.data} userId={user.id} />;
}
