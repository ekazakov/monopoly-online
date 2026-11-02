import { getRouteApi } from "@tanstack/react-router";

const route = getRouteApi("/games/$gameId/play");

// Placeholder. The H tasks build the game screen; it also shows the result of a finished game.
export function GameScreen() {
  const { gameId } = route.useParams();
  return (
    <main className="screen">
      <h1>Game</h1>
      <p>Game {gameId}</p>
    </main>
  );
}
