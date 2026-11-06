import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { Game, Seat, Token } from "@monopoly/shared";
import { useEffect, useRef, useState } from "react";
import { isApiError } from "../../api/index.ts";
import { useRealtimeStatus, useTopic } from "../../realtime/index.ts";
import { AddSeatForm } from "./AddSeatForm.tsx";
import { CancelGame } from "./CancelGame.tsx";
import { GameCancelled } from "./GameCancelled.tsx";
import { SavedGameFinished } from "./SavedGameFinished.tsx";
import { InviteLink } from "./InviteLink.tsx";
import { InvitePanel } from "./InvitePanel.tsx";
import { roomKey } from "./queries.ts";
import {
  errorText,
  notBackHint,
  roomCopy,
  roomView,
  waitingForInvitees,
  type RoomAction,
} from "./roomModel.ts";
import { SeatList } from "./SeatList.tsx";
import { TokenPicker } from "./TokenPicker.tsx";
import { useRoomActions } from "./useRoomActions.ts";
import "./Room.css";

export function Room({ game, userId }: { game: Game; userId: string }) {
  const gameId = game.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const actions = useRoomActions(gameId);
  const view = roomView(game, userId);
  const realtime = useRealtimeStatus();
  const [notice, setNotice] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
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
  useTopic(view.seated && !cancelled ? `game:${gameId}` : null, (message) => {
    if (message.type === "room.cancelled") {
      // The host's own request answers the host: the stream copy would only flash the notice.
      if (actions.cancel.isPending || actions.cancel.isSuccess) return;
      gone.current = true;
      setCancelled(true);
    } else if (message.type === "room.updated" || message.type === "snapshot") {
      queryClient.setQueryData(roomKey(gameId), message.payload.game);
    }
  });

  function fail(action: RoomAction, error: unknown) {
    setNotice(errorText(action, error));
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

  const hostName = view.host?.name ?? "the host";
  const busy = actions.start.isPending;

  if (cancelled) return <GameCancelled hostName={view.host?.name ?? "The host"} />;
  if (finishedWhileSaved && view.seated) {
    return <SavedGameFinished hostName={view.host?.name ?? "The host"} onSeeResult={goToPlay} />;
  }
  const myUnclaimed = game.seats.some((seat) => seat.controllerUserId === userId && !seat.claimed);

  return (
    <div className="room">
      <header className="room__top">
        <span className="room__brand">Harborfront</span>
        <Link to="/" className="room__back">
          Home
        </Link>
      </header>
      <main className="room__main">
        <div className="room__intro">
          <p className="room__eyebrow">Game room</p>
          <h1 className="room__title">
            {game.name}
            {saved && <span className="room__tag room__tag--status">Saved</span>}
          </h1>
          {saved && view.seated && (
            <p className="room__text">
              Open this game link and claim your seats. Then the host starts the game.
            </p>
          )}
        </div>

        {view.seated && realtime === "reconnecting" && (
          <p className="room__notice" data-tone="warn" role="status">
            Reconnecting… Updates may be late.
          </p>
        )}
        {notice && (
          <p className="room__notice" data-tone="error" role="alert">
            {notice}
          </p>
        )}
        {!view.seated && saved && (
          <p className="room__notice" data-tone="error" role="status">
            {roomCopy.savedVisitor}
          </p>
        )}
        {!view.seated && started && (
          <p className="room__notice" data-tone="error" role="status">
            {roomCopy.started}
          </p>
        )}

        <SeatList
          game={game}
          userId={userId}
          removingId={removingId}
          onRemove={remove}
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
              <p className="room__text">All 6 seats are taken.</p>
            ) : (
              <AddSeatForm add={actions.add} inputRef={nameRef} />
            )}
          </>
        )}

        <section className="room__actions" aria-label="Game actions">
          {view.seated && saved && (
            <>
              {myUnclaimed && (
                <>
                  <p className="room__hint">Claim your seats so the host sees that you are back.</p>
                  <button
                    type="button"
                    className={`room__button${view.isOwner ? "" : " room__button--primary"}`}
                    onClick={claim}
                    aria-disabled={actions.claim.isPending || undefined}
                  >
                    {actions.claim.isPending ? "Claiming" : "Claim my seats"}
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
                    {actions.restore.isPending ? "Starting" : "Start game"}
                  </button>
                  <p id="room-restore-hint" className="room__hint">
                    {notBackHint(game.seats)}
                  </p>
                </>
              ) : (
                !myUnclaimed && (
                  <p className="room__text" role="status">
                    Waiting for {hostName} to start the game.
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
                {actions.join.isPending ? "Joining" : "Join game"}
              </button>
              <p className="room__hint">You join with your own name.</p>
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
                {busy ? "Starting" : "Start game"}
              </button>
              <p id="room-start-hint" className="room__hint">
                {[
                  view.canStart ? `${game.seats.length} players ready.` : roomCopy.notEnough,
                  waitingForInvitees(game.invites),
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
                Waiting for {hostName} to start
              </p>
              <p className="room__hint">
                The game starts for everyone at once. You can leave any time before that.
              </p>
              <button
                type="button"
                className="room__button"
                onClick={leave}
                aria-disabled={actions.leave.isPending || undefined}
              >
                Leave game
              </button>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
