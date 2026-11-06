import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { Invite, LobbyGame } from "@monopoly/shared";
import { useId, useState } from "react";
import { claimSeats, finishGame, joinGame } from "../../api/games.ts";
import { acceptInvite, declineInvite } from "../../api/lobby.ts";
import { ApiError } from "../../api.ts";
import { useSession, useSignOut } from "../../session/index.ts";
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
      else setNotice(noticeFor(error, "join"));
    },
  });
  const accept = useMutation({
    mutationFn: (invite: Invite) => acceptInvite(invite.id),
    onSuccess: (game) => openRoom(game.id),
    onError: (error) => setNotice(noticeFor(error, "accept")),
  });
  const decline = useMutation({
    mutationFn: (invite: Invite) => declineInvite(invite.id),
    onError: (error) => setNotice(noticeFor(error, "decline")),
  });

  // Continue takes the seats of the owner and opens the restore room, where the owner presses Start.
  const resume = useMutation({
    mutationFn: (game: LobbyGame) => claimSeats(game.id),
    onSuccess: (game) => openRoom(game.id),
    onError: (error) => setNotice(noticeFor(error, "continue")),
  });
  const finish = useMutation({
    mutationFn: (game: LobbyGame) => finishGame(game.id),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: myGamesQuery.queryKey }),
    onError: (error) => setNotice(noticeFor(error, "finish")),
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
        <h1>Lobby</h1>
        <div className="lobby__who">
          <span>
            Signed in as <strong>{userName}</strong>
          </span>
          <button
            type="button"
            className="lobby__button"
            disabled={signOut.isPending}
            onClick={() =>
              signOut.mutate(undefined, { onSuccess: () => void navigate({ to: "/sign-in" }) })
            }
          >
            Sign out
          </button>
        </div>
      </header>
      {signOut.isError && <p role="alert">Could not sign out. Try again.</p>}
      {reconnecting && <p role="status">Reconnecting… The lists may be out of date.</p>}

      {notice && (
        <div className="lobby__notice" role="alert">
          <div>
            <h2 className="lobby__notice-title">{notice.title}</h2>
            <p>{notice.text}</p>
          </div>
          <button type="button" className="lobby__button" onClick={() => setNotice(null)}>
            Dismiss
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
          <h2 id={openId}>Open games</h2>
          {games === null ? (
            <p className="lobby__text">Loading games…</p>
          ) : games.length === 0 ? (
            <div className="lobby__empty">
              <h3>No open games</h3>
              <p>Start one and invite friends by name or with a link.</p>
            </div>
          ) : (
            <ul className="lobby__list" aria-label="Open games" aria-live="polite">
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
          <p className="lobby__text">Games that have started leave this list.</p>
        </section>

        <NewGamePanel userName={userName} />
      </div>

      {savedOwn.length > 0 && (
        <section className="lobby__panel" aria-labelledby={savedId}>
          <h2 id={savedId}>Saved games</h2>
          <p className="lobby__text">
            Games you saved. Continue opens the room, where each player claims their seats.
          </p>
          <ul className="lobby__list" aria-label="Saved games">
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
        <h2 id={mineId}>My games</h2>
        <p className="lobby__text">Games you play in, on this device or another</p>
        {myGames.isPending ? (
          <p className="lobby__text">Loading your games…</p>
        ) : myGames.isError ? (
          <div className="lobby__empty">
            <p>Could not load your games.</p>
            <button type="button" className="lobby__button" onClick={() => void myGames.refetch()}>
              Try again
            </button>
          </div>
        ) : others.length === 0 ? (
          <p className="lobby__text">
            {savedOwn.length === 0 ? "You are not in a game yet." : "No other games."}
          </p>
        ) : (
          <ul className="lobby__list" aria-label="My games">
            {others.map((game) => (
              <MyGameRow key={game.id} game={game} userName={userName} onOpen={openGame} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
