import { useQuery } from "@tanstack/react-query";
import { Navigate, getRouteApi, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useSyncExternalStore } from "react";
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
} from "../game/index.ts";
import { useRealtimeStatus, useTopic } from "../realtime/index.ts";
import { BoardScene } from "../scene/BoardScene.tsx";
import type { ScenePlayer } from "../scene/model.ts";
import { useSession } from "../session/index.ts";
import { GameLayout } from "./game/GameLayout.tsx";
import { GameOverPlaceholder } from "./game/GameOverPlaceholder.tsx";
import { CardNotice } from "./game/flows/card/index.ts";
import { LeaveGameMenu } from "./game/flows/leave/index.ts";
import { GameLog } from "./game/log/index.ts";
import { PlayerRail } from "./game/rail/index.ts";
import { PropertyHand } from "./game/hand/index.ts";
import { TurnArea } from "./game/turn/index.ts";
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
  const userId = user?.id ?? null;

  const room = useQuery(gameRoomQuery(store, gameId));
  const status = useGameSelector((s) => s.game?.status) ?? room.data?.status;
  const live = room.isSuccess && status !== "waiting";
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
  if (status === "waiting") {
    return <Navigate to="/games/$gameId" params={{ gameId }} replace />;
  }
  if (!userId) return null;

  return (
    <GameActionsContext value={actions}>
      <GameLayout
        rail={<PlayerRail userId={userId} />}
        log={<GameLog userId={userId} />}
        board={<Board userId={userId} />}
        centre={<Centre userId={userId} loadFailed={state.isError && state.data === undefined} />}
        hand={<PropertyHand userId={userId} />}
        menu={<LeaveGameMenu userId={userId} onLeft={() => void navigate({ to: "/" })} />}
      />
    </GameActionsContext>
  );
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (listener) => {
      const query = window.matchMedia?.(REDUCED_MOTION);
      query?.addEventListener("change", listener);
      return () => query?.removeEventListener("change", listener);
    },
    () => window.matchMedia?.(REDUCED_MOTION).matches ?? false,
  );
}

// Colour index = seat order, the same index the rail uses.
function Board({ userId }: { userId: string }) {
  const { game, state } = useGame(userId);
  const reducedMotion = useReducedMotion();
  const players = useMemo<ScenePlayer[]>(
    () =>
      (game?.seats ?? []).map((seat) => ({ id: seat.id, name: seat.name, colorIndex: seat.order })),
    [game],
  );
  return (
    <div className="game-board">
      <BoardScene state={state} players={players} reducedMotion={reducedMotion} />
    </div>
  );
}

// The card reveal stays mounted from the first render, so it sees the version at mount. Over the
// phase view it shows the card of the latest action. A finished game shows the result placeholder.
function Centre({ userId, loadFailed }: { userId: string; loadFailed: boolean }) {
  const { game, state } = useGame(userId);
  return (
    <div className="game-centre">
      <CardNotice userId={userId} />
      {loadFailed && (
        <p className="game-placeholder" role="alert">
          Could not load the game state.
        </p>
      )}
      {isFinished(game, state) ? <GameOverPlaceholder /> : <TurnArea userId={userId} />}
    </div>
  );
}
