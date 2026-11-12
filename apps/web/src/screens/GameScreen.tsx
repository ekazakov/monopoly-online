import { SQUARES, isProperty } from "@monopoly/game-engine";
import { useQuery } from "@tanstack/react-query";
import { Navigate, getRouteApi, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { isApiError } from "../api/index.ts";
import { useT } from "../i18n/index.ts";
import { useGameSounds } from "../audio/useGameSounds.ts";
import {
  GameActionsContext,
  GameStoreProvider,
  gameRoomQuery,
  gameStateQuery,
  isFinished,
  useGame,
  useGameActionsProvider,
  useGameSelector,
  useGameStore,
} from "../game/index.ts";
import { useRealtimeStatus, useTopic } from "../realtime/index.ts";
import { BoardScene } from "../scene/BoardScene.tsx";
import type { ScenePlayer } from "../scene/model.ts";
import { useAuthMethods, useSession } from "../session/index.ts";
import { useReducedMotion } from "../styles/motionPreference.ts";
import { ConnectionBanner } from "./game/ConnectionBanner.tsx";
import { GameLayout } from "./game/GameLayout.tsx";
import { PhaseModal } from "./game/modal/index.ts";
import { CardNotice, useCardNotice } from "./game/flows/card/index.ts";
import {
  SquareDialogs,
  SquareViewProvider,
  SquaresButton,
  useSquareView,
} from "./game/square/index.ts";
import { TurnToast } from "./game/toast/index.ts";
import { LeaveGameMenu } from "./game/flows/leave/index.ts";
import { SavedNotice } from "./game/flows/saved/index.ts";
import { DebugPanel } from "./game/debug/index.ts";
import { GameLog } from "./game/log/index.ts";
import { MotionProvider, useMotionPlayback } from "./game/motion/index.ts";
import { PlayerRail } from "./game/rail/index.ts";
import { PropertyHand } from "./game/hand/index.ts";
import { TurnArea } from "./game/turn/index.ts";
import { GameResultScreen } from "./result/index.ts";
import { NotFoundScreen } from "./NotFoundScreen.tsx";

const route = getRouteApi("/games/$gameId/play");

// One store per game id: the key makes a new id start from an empty store.
export function GameScreen() {
  const { gameId } = route.useParams();
  return (
    <GameStoreProvider key={gameId}>
      <GameRoute gameId={gameId} />
    </GameStoreProvider>
  );
}

function Message({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="screen" role="status">
      <h1>{title}</h1>
      {children}
    </main>
  );
}

function GameRoute({ gameId }: { gameId: string }) {
  const t = useT();
  const store = useGameStore();
  const navigate = useNavigate();
  const { data: user } = useSession();
  // Debug mode is set on the server (DEBUG_MODE_ENABLED). The panel shows only when it is on.
  const { data: methods } = useAuthMethods();
  const userId = user?.id ?? null;

  const room = useQuery(gameRoomQuery(store, gameId));
  const status = useGameSelector((s) => s.game?.status) ?? room.data?.status;
  // A game that was running on this screen and is saved now: its notice shows on every device. A
  // saved game that is opened later has no table, so it goes to the room (gameplay 3.1).
  const [wasActive, setWasActive] = useState(false);
  if (status === "active" && !wasActive) setWasActive(true);
  const saved = status === "saved";
  const seated = room.data?.seats.some((seat) => seat.controllerUserId === userId) ?? false;
  const live = room.isSuccess && seated && status !== "waiting" && !(saved && !wasActive);
  const finished = useGameSelector((s) => isFinished(s.game, s.state));
  const roomGame = useGameSelector((s) => s.game) ?? room.data ?? null;
  const state = useQuery(gameStateQuery(store, gameId, live));

  useEffect(() => store.setLoading(), [store]);

  useTopic(live ? `game:${gameId}` : null, store.applyStreamMessage);

  const realtime = useRealtimeStatus();
  useEffect(() => {
    store.setConnection(realtime === "idle" ? "connecting" : realtime);
  }, [store, realtime]);

  const { refetch } = state;
  const gap = useGameSelector((s) => s.gapDetected);
  useEffect(() => {
    if (!gap) return;
    void refetch().then((result) => {
      if (result.isSuccess) store.clearGap();
    });
  }, [gap, refetch, store]);

  // A game that ends live: the store sees the end first, so the room is read again to bring its
  // status to `finished`.
  const { refetch: refetchRoom } = room;
  const roomStatus = room.data?.status;
  useEffect(() => {
    if (finished && roomStatus !== undefined && roomStatus !== "finished") void refetchRoom();
  }, [finished, roomStatus, refetchRoom]);

  const actions = useGameActionsProvider(gameId, userId, () => void refetch());
  const sounds = useGameSounds(userId);

  if (room.isPending) return <Message title={t("roomScreen.loading")} />;
  if (room.isError) {
    if (isApiError(room.error, "not_found")) return <NotFoundScreen />;
    if (isApiError(room.error, "not_a_member")) {
      return (
        <Message title={t("room.notYours.title")}>
          <p>{t("room.notYours.text")}</p>
        </Message>
      );
    }
    return (
      <Message title={t("roomScreen.failed")}>
        <p>{room.error.message}</p>
        <button type="button" onClick={() => void room.refetch()}>
          {t("roomScreen.retry")}
        </button>
      </Message>
    );
  }
  if (status === "waiting" || (saved && !wasActive)) {
    return <Navigate to="/games/$gameId" params={{ gameId }} replace />;
  }
  if (!seated) {
    return (
      <Message title={t("room.notYours.title")}>
        <p>{t("room.notYours.text")}</p>
      </Message>
    );
  }
  if (!userId) return null;
  if (finished && roomGame) {
    return <GameResultScreen gameId={gameId} seats={roomGame.seats} userId={userId} />;
  }

  return (
    <GameActionsContext value={actions}>
      <MotionProvider listener={sounds}>
        <SquareViewProvider>
          <ConnectionBanner />
          <GameLayout
            rail={<PlayerRail userId={userId} />}
            log={<GameLog userId={userId} />}
            board={<Board userId={userId} />}
            centre={
              <Centre
                userId={userId}
                loadFailed={state.isError && state.data === undefined}
                saved={saved}
                onSavedOk={() => void navigate({ to: "/" })}
              />
            }
            hand={<PropertyHand userId={userId} />}
            menu={
              <>
                <SquaresButton />
                {methods?.debug === true && <DebugPanel userId={userId} />}
                <LeaveGameMenu userId={userId} onLeft={() => void navigate({ to: "/" })} />
              </>
            }
            overlay={<Overlay userId={userId} />}
          />
        </SquareViewProvider>
      </MotionProvider>
    </GameActionsContext>
  );
}

// Above the regions: the turn toast, the square dialogs, and a modal dialog: the drawn card, or the phase. The toast is
// not a dialog: it shows on every device at once, with no confirm step (spec 5.3).
function Overlay({ userId }: { userId: string }) {
  const card = useCardNotice(userId);
  return (
    <>
      <TurnToast userId={userId} />
      {/* The square dialogs come first in the DOM, so a card or a phase dialog lies above them. */}
      <SquareDialogs userId={userId} />
      {card ? <CardNotice notice={card} /> : <PhaseModal userId={userId} />}
    </>
  );
}

// The token of the seat decides the colour and the figure, the same as in the rail.
function Board({ userId }: { userId: string }) {
  const { game, state } = useGame(userId);
  const reducedMotion = useReducedMotion();
  const motion = useMotionPlayback();
  const { detail, openDetail } = useSquareView();
  const players = useMemo<ScenePlayer[]>(
    () => (game?.seats ?? []).map((seat) => ({ id: seat.id, name: seat.name, token: seat.token })),
    [game],
  );
  return (
    <div className="game-board">
      <BoardScene
        state={state}
        players={players}
        motion={motion}
        reducedMotion={reducedMotion}
        highlightSquare={detail}
        onSquareClick={(square) => {
          // Only properties have a detail (R-B5). The other squares do nothing.
          const info = SQUARES[square];
          if (info && isProperty(info)) openDetail(square);
        }}
      />
    </div>
  );
}

function Centre({
  userId,
  loadFailed,
  saved,
  onSavedOk,
}: {
  userId: string;
  loadFailed: boolean;
  saved: boolean;
  onSavedOk: () => void;
}) {
  const t = useT();
  if (saved) {
    return (
      <div className="game-centre">
        <SavedNotice userId={userId} onOk={onSavedOk} />
      </div>
    );
  }
  return (
    <div className="game-centre">
      {loadFailed && (
        <p className="game-placeholder" role="alert">
          {t("game.stateFailed")}
        </p>
      )}
      <TurnArea userId={userId} />
    </div>
  );
}
