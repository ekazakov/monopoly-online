import { useQuery } from "@tanstack/react-query";
import { client, unwrap } from "../api.ts";

// Placeholder. Task G2 replaces it with the create-game flow.
export function HomeScreen() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => unwrap(await client.api.health.$get()),
  });

  const status = health.isPending
    ? "API: checking…"
    : health.isError
      ? `API: ${health.error.message}`
      : "API ok";

  return (
    <main className="screen">
      <h1>Home</h1>
      <p role="status">{status}</p>
    </main>
  );
}
