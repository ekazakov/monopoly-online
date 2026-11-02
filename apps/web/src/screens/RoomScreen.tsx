import { getRouteApi } from "@tanstack/react-router";

const route = getRouteApi("/games/$gameId");

// Placeholder. The game room (the invite page) comes with the G tasks.
export function RoomScreen() {
  const { gameId } = route.useParams();
  return (
    <main className="screen">
      <h1>Room</h1>
      <p>Game {gameId}</p>
    </main>
  );
}
