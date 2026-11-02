import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { createAppRouter } from "../router.tsx";
import { sessionKey } from "../session/index.ts";
import { userFixture } from "./fakeApi.ts";

// No retries and no cache time, so a failed query shows its error at once and tests stay apart.
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
}

export function renderWithQuery(ui: ReactElement, queryClient = createTestQueryClient()) {
  return {
    queryClient,
    ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
  };
}

type RouteView = RenderResult & {
  queryClient: QueryClient;
  router: ReturnType<typeof createAppRouter>;
};

// Renders the real route tree on a memory history at `path`. Waits for the first navigation to load.
// The route guard needs a session, so the cache starts with `userFixture` signed in and the screen
// tests need no /api/me mock. Pass your own `queryClient` to start from another cache.
export async function renderRoute(
  path: string,
  queryClient = createTestQueryClient(),
): Promise<RouteView> {
  if (queryClient.getQueryData(sessionKey) === undefined) {
    queryClient.setQueryData(sessionKey, userFixture);
  }
  return renderRouteWithServerSession(path, queryClient);
}

// Same, but the session cache starts empty, so the guard asks `GET /api/me` (mock it with `mockApi`).
export async function renderRouteWithServerSession(
  path: string,
  queryClient = createTestQueryClient(),
): Promise<RouteView> {
  const router = createAppRouter({
    queryClient,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...result, queryClient, router };
}
