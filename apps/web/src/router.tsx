import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  type RouterHistory,
} from "@tanstack/react-router";
import { GameScreen } from "./screens/GameScreen.tsx";
import { HomeScreen } from "./screens/HomeScreen.tsx";
import { NotFoundScreen } from "./screens/NotFoundScreen.tsx";
import { RoomScreen } from "./screens/RoomScreen.tsx";
import { SignInScreen } from "./screens/SignInScreen.tsx";
import {
  installUnauthorizedHandler,
  redirectIfSignedIn,
  requireSession,
  safeRedirect,
} from "./session/index.ts";

// Guards (beforeLoad) and loaders reach the query cache through this context.
export interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: NotFoundScreen,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: ({ context, location }) => requireSession(context.queryClient, location),
  component: HomeScreen,
});
const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-in",
  // A bad `redirect` becomes an explicit undefined: the router merges the result over the raw
  // search, so an omitted key would let the bad value through.
  validateSearch: (search: Record<string, unknown>): { redirect?: string | undefined } => ({
    redirect: safeRedirect(search.redirect),
  }),
  beforeLoad: ({ context, search }) => redirectIfSignedIn(context.queryClient, search),
  component: SignInScreen,
});
// The invite link is /games/<uuid>, so the room route is the link target.
const roomRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/games/$gameId",
  beforeLoad: ({ context, location }) => requireSession(context.queryClient, location),
  component: RoomScreen,
});
const gameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/games/$gameId/play",
  beforeLoad: ({ context, location }) => requireSession(context.queryClient, location),
  component: GameScreen,
});

export const routeTree = rootRoute.addChildren([homeRoute, signInRoute, roomRoute, gameRoute]);

export function createAppRouter(options: { queryClient: QueryClient; history?: RouterHistory }) {
  const router = createRouter({
    routeTree,
    history: options.history,
    context: { queryClient: options.queryClient },
  });
  installUnauthorizedHandler(options.queryClient, router);
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
