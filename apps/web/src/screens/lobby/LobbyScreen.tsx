import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { Invite, LobbyGame } from "@monopoly/shared";
import { useId, useState } from "react";
import { claimSeats, finishGame, joinGame } from "../../api/games.ts";
import { acceptInvite, declineInvite } from "../../api/lobby.ts";
import { ApiError } from "../../api.ts";
import { useT } from "../../i18n/index.ts";
import { useSession, useSignOut } from "../../session/index.ts";
import { PreferenceSwitches } from "../PreferenceSwitches.tsx";
import { OpenGameRow, MyGameRow, SavedGameRow } from "./GameRows.tsx";
import { InviteInbox } from "./InviteInbox.tsx";
import { NewGamePanel } from "./NewGamePanel.tsx";
import { noticeFor, type LobbyNotice } from "./notices.ts";
import { useNow } from "./time.ts";
import { myGamesQuery, useLobby } from "./useLobby.ts";
import "./Lobby.css";

/**
 * The lobby (boards Lobby and LobbyStates): the invites inbox, the open games, My games, and the
 * forms to create a game or open one from a link. The open games and the invites are live.
 */
export function LobbyScreen() {
  const { data: user } = useSession();
  if (!user) return null;
  return <Lobby userId={user.id} userName={user.name} />;
}

function Lobby({ userId, userName }: { userId: string; userName: string }) {
  const t = useT();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const now = useNow();
  const { games, invites, myGames, reconnecting } = useLobby(userId);
  const [notice, setNotice] = useState<LobbyNotice | null>(null);
  const openId = useId();
  const mineId = useId();
  const savedId = useId();
  const queryClient = useQueryClient();

  const openRoom = (gameId: string) => void navigate({ to: "/games/$gameId", params: { gameId } });
  const openGame = (game: LobbyGame) =>
    game.status === "active"
      ? void navigate({ to: "/games/$gameId/play", params: { gameId: game.id } })
      : openRoom(game.id);

  const join = useMutation({
    mutationFn: joinGame,
    onSuccess: (game) => openRoom(game.id),
    onError: (error, gameId) => {
      // The user already has a seat: the room is the right place.
      if (error instanceof ApiError && error.code === "already_joined") openRoom(gameId);
      else setNotice(noticeFor(error, "join", t));
    },
  });
  const accept = useMutation({
    mutationFn: (invite: Invite) => acceptInvite(invite.id),
    onSuccess: (game) => openRoom(game.id),
    onError: (error) => setNotice(noticeFor(error, "accept", t)),
  });
  const decline = useMutation({
    mutationFn: (invite: Invite) => declineInvite(invite.id),
    onError: (error) => setNotice(noticeFor(error, "decline", t)),
  });

  // Continue takes the seats of the owner and opens the restore room, where the owner presses Start.
  const resume = useMutation({
    mutationFn: (game: LobbyGame) => claimSeats(game.id),
    onSuccess: (game) => openRoom(game.id),
    onError: (error) => setNotice(noticeFor(error, "continue", t)),
  });
  const finish = useMutation({
    mutationFn: (game: LobbyGame) => finishGame(game.id),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: myGamesQuery.queryKey }),
    onError: (error) => setNotice(noticeFor(error, "finish", t)),
  });
  const savedBusy = resume.isPending || finish.isPending;

  // Saved games that the user owns have their own group. The others are in My games with "Saved".
  const mine = myGames.data ?? [];
  const savedOwn = mine.filter((game) => game.status === "saved" && game.ownerId === userId);
  const others = mine.filter((game) => !savedOwn.includes(game));
  const myIds = new Set(myGames.data?.map((game) => game.id));
  const busyInvite = accept.isPending
    ? accept.variables.id
    : decline.isPending
      ? decline.variables.id
      : null;

  return (
    <main className="screen lobby">
      <header className="lobby__top">
        <h1>{t("lobby.title")}</h1>
        <div className="lobby__who">
          <PreferenceSwitches />
          <span>
            {t("lobby.signedInAs")} <strong>{userName}</strong>
          </span>
          <button
            type="button"
            className="lobby__button"
            disabled={signOut.isPending}
            onClick={() =>
              signOut.mutate(undefined, { onSuccess: () => void navigate({ to: "/sign-in" }) })
            }
          >
            {t("lobby.signOut")}
          </button>
        </div>
      </header>
      {signOut.isError && <p role="alert">{t("lobby.signOutFailed")}</p>}
      {reconnecting && <p role="status">{t("lobby.reconnecting")}</p>}

      {notice && (
        <div className="lobby__notice" role="alert">
          <div>
            <h2 className="lobby__notice-title">{notice.title}</h2>
            <p>{notice.text}</p>
          </div>
          <button type="button" className="lobby__button" onClick={() => setNotice(null)}>
            {t("lobby.dismiss")}
          </button>
        </div>
      )}

      <InviteInbox
        invites={invites ?? []}
        now={now}
        busyId={busyInvite}
        onAccept={(invite) => accept.mutate(invite)}
        onDecline={(invite) => decline.mutate(invite)}
      />

      <div className="lobby__columns">
        <section className="lobby__panel" aria-labelledby={openId}>
          <h2 id={openId}>{t("lobby.open.title")}</h2>
          {games === null ? (
            <p className="lobby__text">{t("lobby.open.loading")}</p>
          ) : games.length === 0 ? (
            <div className="lobby__empty">
              <h3>{t("lobby.open.emptyTitle")}</h3>
              <p>{t("lobby.open.emptyText")}</p>
            </div>
          ) : (
            <ul className="lobby__list" aria-label={t("lobby.open.title")} aria-live="polite">
              {games.map((game) => (
                <OpenGameRow
                  key={game.id}
                  game={game}
                  now={now}
                  mine={myIds.has(game.id)}
                  busy={join.isPending}
                  onJoin={(gameId) => join.mutate(gameId)}
                  onOpen={openGame}
                />
              ))}
            </ul>
          )}
          <p className="lobby__text">{t("lobby.open.footnote")}</p>
        </section>

        <NewGamePanel userName={userName} />
      </div>

      {savedOwn.length > 0 && (
        <section className="lobby__panel" aria-labelledby={savedId}>
          <h2 id={savedId}>{t("lobby.saved.title")}</h2>
          <p className="lobby__text">{t("lobby.saved.text")}</p>
          <ul className="lobby__list" aria-label={t("lobby.saved.title")}>
            {savedOwn.map((game) => (
              <SavedGameRow
                key={game.id}
                game={game}
                busy={savedBusy}
                onContinue={(saved) => resume.mutate(saved)}
                onFinish={(saved) => finish.mutate(saved)}
              />
            ))}
          </ul>
        </section>
      )}

      <section className="lobby__panel" aria-labelledby={mineId}>
        <h2 id={mineId}>{t("lobby.mine.title")}</h2>
        <p className="lobby__text">{t("lobby.mine.text")}</p>
        {myGames.isPending ? (
          <p className="lobby__text">{t("lobby.mine.loading")}</p>
        ) : myGames.isError ? (
          <div className="lobby__empty">
            <p>{t("lobby.mine.failed")}</p>
            <button type="button" className="lobby__button" onClick={() => void myGames.refetch()}>
              {t("lobby.mine.retry")}
            </button>
          </div>
        ) : others.length === 0 ? (
          <p className="lobby__text">
            {savedOwn.length === 0 ? t("lobby.mine.none") : t("lobby.mine.noOthers")}
          </p>
        ) : (
          <ul className="lobby__list" aria-label={t("lobby.mine.title")}>
            {others.map((game) => (
              <MyGameRow key={game.id} game={game} userName={userName} onOpen={openGame} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
