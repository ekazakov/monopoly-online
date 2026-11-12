import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { Game, Seat, Token } from "@monopoly/shared";
import { useEffect, useRef, useState } from "react";
import { isApiError } from "../../api/index.ts";
import { useT } from "../../i18n/index.ts";
import { useRealtimeStatus, useTopic } from "../../realtime/index.ts";
import { AddSeatForm } from "./AddSeatForm.tsx";
import { CancelGame } from "./CancelGame.tsx";
import { GameCancelled } from "./GameCancelled.tsx";
import { GameRemoved } from "./GameRemoved.tsx";
import { SavedGameFinished } from "./SavedGameFinished.tsx";
import { InviteLink } from "./InviteLink.tsx";
import { InvitePanel } from "./InvitePanel.tsx";
import { roomKey } from "./queries.ts";
import {
  errorText,
  notBackHint,
  roomView,
  waitingForInvitees,
  type RoomAction,
} from "./roomModel.ts";
import { SeatList } from "./SeatList.tsx";
import { TokenPicker } from "./TokenPicker.tsx";
import { useRoomActions } from "./useRoomActions.ts";
import "./Room.css";

export function Room({ game, userId }: { game: Game; userId: string }) {
  const t = useT();
  const gameId = game.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const actions = useRoomActions(gameId);
  const view = roomView(game, userId);
  const realtime = useRealtimeStatus();
  const [notice, setNotice] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [removed, setRemoved] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const started = game.status === "active" || game.status === "finished";
  const saved = game.status === "saved";
  // The host finished a saved game while this room was open: a notice first, then the result.
  const [wasSaved, setWasSaved] = useState(false);
  if (saved && !wasSaved) setWasSaved(true);
  const finishedWhileSaved = wasSaved && game.status === "finished";
  const goToPlay = () =>
    void navigate({ to: "/games/$gameId/play", params: { gameId }, replace: true });

  useEffect(() => {
    if (started && view.seated && !finishedWhileSaved)
      void navigate({ to: "/games/$gameId/play", params: { gameId }, replace: true });
  }, [started, view.seated, finishedWhileSaved, navigate, gameId]);

  // The game was deleted. Its cached room must not show again, so it is dropped when the screen
  // goes: a later visit to the link asks the server and gets the 404 view.
  const gone = useRef(false);
  useEffect(
    () => () => {
      if (gone.current) queryClient.removeQueries({ queryKey: roomKey(gameId) });
    },
    [queryClient, gameId],
  );

  // A visitor has no seat, so the stream would refuse them: they follow the room only after joining.
  // After a cancel the topic is null, which drops the subscription. Without that the EventSource
  // would connect to the deleted game again and again.
  useTopic(view.seated && !cancelled && !removed ? `game:${gameId}` : null, (message) => {
    if (message.type === "room.cancelled") {
      // The host's own request answers the host: the stream copy would only flash the notice.
      if (actions.cancel.isPending || actions.cancel.isSuccess) return;
      gone.current = true;
      setCancelled(true);
    } else if (message.type === "room.updated" || message.type === "snapshot") {
      // The host removed this user: `room.removed` follows at once. Until then the old room stays,
      // so the user does not see a visitor view with a Join button for a moment.
      const stillSeated = message.payload.game.seats.some((s) => s.controllerUserId === userId);
      if (!stillSeated && view.seated) return;
      queryClient.setQueryData(roomKey(gameId), message.payload.game);
    }
  });

  // The host removed this user from the game. The private topic carries that message.
  useTopic(view.seated && !removed ? `user:${userId}` : null, (message) => {
    if (message.type !== "room.removed" || message.payload.gameId !== gameId) return;
    gone.current = true;
    setRemoved(true);
  });

  function fail(action: RoomAction, error: unknown) {
    setNotice(errorText(action, error, t));
    // The room changed under the user (or they are out of date): read it again.
    if (isApiError(error) && error.status === 409) void actions.reload();
  }

  function join() {
    if (actions.join.isPending) return;
    setNotice(null);
    actions.join.mutate(undefined, { onError: (error) => fail("join", error) });
  }

  function leave() {
    if (actions.leave.isPending) return;
    setNotice(null);
    actions.leave.mutate(undefined, {
      onSuccess: () => void navigate({ to: "/" }),
      onError: (error) => fail("leave", error),
    });
  }

  function start() {
    if (!view.canStart || actions.start.isPending) return;
    setNotice(null);
    actions.start.mutate(undefined, {
      onSuccess: goToPlay,
      onError: (error) => fail("start", error),
    });
  }

  function cancel() {
    if (actions.cancel.isPending) return;
    setNotice(null);
    actions.cancel.mutate(undefined, {
      onSuccess: () => {
        gone.current = true;
        void navigate({ to: "/" });
      },
      onError: (error) => fail("cancel", error),
    });
  }

  function claim() {
    if (actions.claim.isPending) return;
    setNotice(null);
    actions.claim.mutate(undefined, { onError: (error) => fail("claim", error) });
  }

  // Start of a saved game is Restore: it is never blocked, even when players are not back.
  function restore() {
    if (actions.restore.isPending) return;
    setNotice(null);
    actions.restore.mutate(undefined, {
      onSuccess: goToPlay,
      onError: (error) => fail("restore", error),
    });
  }

  function pickToken(seat: Seat, token: Token) {
    if (actions.pickToken.isPending) return;
    setNotice(null);
    actions.pickToken.mutate(
      { seatId: seat.id, token },
      { onError: (error) => fail("token", error) },
    );
  }

  function remove(seat: Seat) {
    if (actions.remove.isPending) return;
    setNotice(null);
    setRemovingId(seat.id);
    actions.remove.mutate(seat.id, {
      onSuccess: () => (nameRef.current ?? headingRef.current)?.focus(),
      onError: (error) => fail("remove", error),
      onSettled: () => setRemovingId(null),
    });
  }

  function removePlayer(seat: Seat) {
    if (!seat.userId || actions.removePlayer.isPending) return;
    setNotice(null);
    actions.removePlayer.mutate(seat.userId, {
      onSuccess: () => headingRef.current?.focus(),
      onError: (error) => fail("removePlayer", error),
    });
  }

  const hostName = view.host?.name ?? t("room.theHost");
  const hostNameCap = view.host?.name ?? t("room.theHostCap");
  const busy = actions.start.isPending;

  if (cancelled) return <GameCancelled hostName={hostNameCap} />;
  if (removed) return <GameRemoved hostName={hostNameCap} />;
  if (started && !view.seated) {
    return (
      <main className="screen" role="alert">
        <h1>{t("room.notYours.title")}</h1>
        <p>{t("room.notYours.text")}</p>
      </main>
    );
  }
  if (finishedWhileSaved && view.seated) {
    return <SavedGameFinished hostName={hostNameCap} onSeeResult={goToPlay} />;
  }
  const myUnclaimed = game.seats.some((seat) => seat.controllerUserId === userId && !seat.claimed);

  return (
    <div className="room">
      <header className="room__top">
        <span className="room__brand">Harborfront</span>
        <Link to="/" className="room__back">
          {t("room.home")}
        </Link>
      </header>
      <main className="room__main">
        <div className="room__intro">
          <p className="room__eyebrow">{t("room.eyebrow")}</p>
          <h1 className="room__title">
            {game.name}
            {saved && <span className="room__tag room__tag--status">{t("room.saved")}</span>}
          </h1>
          {saved && view.seated && <p className="room__text">{t("room.savedIntro")}</p>}
        </div>

        {view.seated && realtime === "reconnecting" && (
          <p className="room__notice" data-tone="warn" role="status">
            {t("room.reconnecting")}
          </p>
        )}
        {notice && (
          <p className="room__notice" data-tone="error" role="alert">
            {notice}
          </p>
        )}
        {!view.seated && saved && (
          <p className="room__notice" data-tone="error" role="status">
            {t("room.savedVisitor")}
          </p>
        )}
        <SeatList
          game={game}
          userId={userId}
          removingId={removingId}
          onRemove={remove}
          removingPlayerId={actions.removePlayer.isPending ? actions.removePlayer.variables : null}
          onRemovePlayer={removePlayer}
          headingRef={headingRef}
        />

        {view.seated && game.status === "waiting" && (
          <>
            <TokenPicker
              game={game}
              userId={userId}
              pendingSeatId={
                actions.pickToken.isPending ? actions.pickToken.variables.seatId : null
              }
              onPick={pickToken}
            />
            {view.isOwner && !view.full && <InvitePanel invite={actions.invite} />}
            <InviteLink gameId={gameId} />
            {view.full ? (
              <p className="room__text">{t("room.allTaken")}</p>
            ) : (
              <AddSeatForm add={actions.add} inputRef={nameRef} />
            )}
          </>
        )}

        <section className="room__actions" aria-label={t("room.actions")}>
          {view.seated && saved && (
            <>
              {myUnclaimed && (
                <>
                  <p className="room__hint">{t("room.claimHint")}</p>
                  <button
                    type="button"
                    className={`room__button${view.isOwner ? "" : " room__button--primary"}`}
                    onClick={claim}
                    aria-disabled={actions.claim.isPending || undefined}
                  >
                    {actions.claim.isPending ? t("room.claiming") : t("room.claim")}
                  </button>
                </>
              )}
              {view.isOwner ? (
                <>
                  <button
                    type="button"
                    className="room__button room__button--primary"
                    onClick={restore}
                    aria-disabled={actions.restore.isPending || undefined}
                    aria-describedby="room-restore-hint"
                  >
                    {actions.restore.isPending ? t("room.starting") : t("room.start")}
                  </button>
                  <p id="room-restore-hint" className="room__hint">
                    {notBackHint(game.seats, t)}
                  </p>
                </>
              ) : (
                !myUnclaimed && (
                  <p className="room__text" role="status">
                    {t("room.waitingHostGame", { name: hostName })}
                  </p>
                )
              )}
            </>
          )}
          {!view.seated && game.status === "waiting" && (
            <>
              <button
                type="button"
                className="room__button room__button--primary"
                onClick={join}
                aria-disabled={actions.join.isPending || undefined}
              >
                {actions.join.isPending ? t("room.joining") : t("room.join")}
              </button>
              <p className="room__hint">{t("room.joinHint")}</p>
            </>
          )}
          {view.seated && view.isOwner && game.status === "waiting" && (
            <>
              <button
                type="button"
                className="room__button room__button--primary"
                onClick={start}
                aria-disabled={!view.canStart || busy || undefined}
                aria-describedby="room-start-hint"
              >
                {busy ? t("room.starting") : t("room.start")}
              </button>
              <p id="room-start-hint" className="room__hint">
                {[
                  view.canStart
                    ? t("room.playersReady", { count: game.seats.length })
                    : t("room.notEnough"),
                  waitingForInvitees(game.invites, t),
                ]
                  .filter(Boolean)
                  .join(" ")}
              </p>
              <CancelGame pending={actions.cancel.isPending} onCancel={cancel} />
            </>
          )}
          {view.seated && !view.isOwner && game.status === "waiting" && (
            <>
              <p className="room__text" role="status">
                {t("room.waitingHost", { name: hostName })}
              </p>
              <p className="room__hint">{t("room.startsAtOnce")}</p>
              <button
                type="button"
                className="room__button"
                onClick={leave}
                aria-disabled={actions.leave.isPending || undefined}
              >
                {t("room.leave")}
              </button>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
