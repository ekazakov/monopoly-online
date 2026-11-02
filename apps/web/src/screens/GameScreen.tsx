import { getRouteApi } from "@tanstack/react-router";
import { GameLayout } from "./game/GameLayout.tsx";

const route = getRouteApi("/games/$gameId/play");

// The H tasks fill the slots: rail H3, log H4, board H2, centre H5/H7, hand H6, menu H7. H10 shows the result.
export function GameScreen() {
  const { gameId } = route.useParams();
  return (
    <GameLayout
      rail={<p className="game-placeholder">Player rail</p>}
      log={<p className="game-placeholder">Game log</p>}
      board={<p className="game-placeholder">Board</p>}
      centre={
        <div className="game-placeholder">
          <p>Turn area</p>
          <p>Game {gameId}</p>
        </div>
      }
      hand={<p className="game-placeholder">Property hand</p>}
      menu={<p className="game-placeholder">Menu</p>}
    />
  );
}
