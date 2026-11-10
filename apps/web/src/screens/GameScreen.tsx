import { useQuery } from "@tanstack/react-query";
import { Navigate, getRouteApi, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { isApiError } from "../api/index.ts";
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
  useHotSeatHandoff,
} from "../game/index.ts";
import { useRealtimeStatus, useTopic } from "../realtime/index.ts";
import { BoardScene } from "../scene/BoardScene.tsx";
import type { ScenePlayer } from "../scene/model.ts";
import { useAuthMethods, useSession } from "../session/index.ts";
import { useReducedMotion } from "../styles/motionPreference.ts";
import { ConnectionBanner } from "./game/ConnectionBanner.tsx";
import { GameLayout } from "./game/GameLayout.tsx";
import { Handoff } from "./game/handoff/index.ts";
import { PhaseModal } from "./game/modal/index.ts";
import { CardNotice, useCardNotice } from "./game/flows/card/index.ts";
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

  if (room.isPending) return <Message title="Loading the game" />;
  if (room.isError) {
    if (isApiError(room.error, "not_found")) return <NotFoundScreen />;
    if (isApiError(room.error, "not_a_member")) {
      return (
        <Message title="Not your game">
          <p>You have no seat in this game.</p>
        </Message>
      );
    }
    return (
      <Message title="Could not load the game">
        <p>{room.error.message}</p>
        <button type="button" onClick={() => void room.refetch()}>
          Try again
        </button>
      </Message>
    );
  }
  if (status === "waiting" || (saved && !wasActive)) {
    return <Navigate to="/games/$gameId" params={{ gameId }} replace />;
  }
  if (!seated) {
    return (
      <Message title="Not your game">
        <p>You have no seat in this game.</p>
      </Message>
    );
  }
  if (!userId) return null;
  if (finished && roomGame) {
    return <GameResultScreen gameId={gameId} seats={roomGame.seats} userId={userId} />;
  }

  return (
    <GameActionsContext value={actions}>
      <MotionProvider>
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
              {methods?.debug === true && <DebugPanel userId={userId} />}
              <LeaveGameMenu userId={userId} onLeft={() => void navigate({ to: "/" })} />
            </>
          }
          overlay={<Overlay userId={userId} />}
        />
      </MotionProvider>
    </GameActionsContext>
  );
}

// Above the regions: the hot-seat handoff, or else a modal dialog: the drawn card, or the phase.
// A dialog waits for the handoff, so the next player does not see or answer it before they confirm.
// The card hook stays mounted here, also during a handoff, so it sees the version at mount. The
// card comes first: the phase dialog (for example Buy) follows after OK.
function Overlay({ userId }: { userId: string }) {
  const { pending, confirm } = useHotSeatHandoff(userId);
  const card = useCardNotice(userId);
  if (pending) return <Handoff seat={pending} onConfirm={confirm} />;
  if (card) return <CardNotice notice={card} />;
  return <PhaseModal userId={userId} />;
}

// The token of the seat decides the colour and the figure, the same as in the rail.
function Board({ userId }: { userId: string }) {
  const { game, state } = useGame(userId);
  const reducedMotion = useReducedMotion();
  const motion = useMotionPlayback();
  const players = useMemo<ScenePlayer[]>(
    () => (game?.seats ?? []).map((seat) => ({ id: seat.id, name: seat.name, token: seat.token })),
    [game],
  );
  return (
    <div className="game-board">
      <BoardScene state={state} players={players} motion={motion} reducedMotion={reducedMotion} />
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
          Could not load the game state.
        </p>
      )}
      <TurnArea userId={userId} />
    </div>
  );
}
