import { useQuery } from "@tanstack/react-query";
import { client, unwrap } from "./api.ts";
import { BoardScene } from "./scene/BoardScene.tsx";

export function App() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => unwrap(await client.api.health.$get()),
  });
  const games = useQuery({
    queryKey: ["games"],
    queryFn: async () => unwrap(await client.api.games.$get()),
  });

  const status = health.isPending
    ? "API: checking…"
    : health.isError
      ? `API: ${health.error.message}`
      : "API ok";

  return (
    <>
      <BoardScene />
      <div className="status">
        <strong>{status}</strong>
        {games.data && games.data.length > 0 && (
          <ul>
            {games.data.map((game) => (
              <li key={game.id}>{game.name}</li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
