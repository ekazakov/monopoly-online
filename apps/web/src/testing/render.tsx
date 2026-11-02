import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { RealtimeProvider } from "../realtime/index.ts";
import type { RealtimeClient } from "../realtime/index.ts";
import { createAppRouter } from "../router.tsx";
import { sessionKey } from "../session/index.ts";
import { userFixture } from "./fakeApi.ts";
import { FakeRealtimeClient } from "./fakeRealtime.ts";

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

export interface RouteOptions {
  realtime?: RealtimeClient;
}

type RouteView = RenderResult & {
  queryClient: QueryClient;
  router: ReturnType<typeof createAppRouter>;
};

// Renders the real route tree on a memory history at `path`. Waits for the first navigation to load.
// The route guard needs a session, so the cache starts with `userFixture` signed in and the screen
// tests need no /api/me mock. Pass your own `queryClient` to start from another cache.
// The tree gets a `FakeRealtimeClient` unless you pass your own `realtime`, so no test opens a real stream.
export async function renderRoute(
  path: string,
  queryClient = createTestQueryClient(),
  options: RouteOptions = {},
): Promise<RouteView> {
  if (queryClient.getQueryData(sessionKey) === undefined) {
    queryClient.setQueryData(sessionKey, userFixture);
  }
  return renderRouteWithServerSession(path, queryClient, options);
}

// Same, but the session cache starts empty, so the guard asks `GET /api/me` (mock it with `mockApi`).
export async function renderRouteWithServerSession(
  path: string,
  queryClient = createTestQueryClient(),
  options: RouteOptions = {},
): Promise<RouteView> {
  const router = createAppRouter({
    queryClient,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RealtimeProvider client={options.realtime ?? new FakeRealtimeClient()}>
        <RouterProvider router={router} />
      </RealtimeProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient, router };
}
