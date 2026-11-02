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
  component: HomeScreen,
});
const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-in",
  component: SignInScreen,
});
// The invite link is /games/<uuid>, so the room route is the link target.
const roomRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/games/$gameId",
  component: RoomScreen,
});
const gameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/games/$gameId/play",
  component: GameScreen,
});

export const routeTree = rootRoute.addChildren([homeRoute, signInRoute, roomRoute, gameRoute]);

export function createAppRouter(options: { queryClient: QueryClient; history?: RouterHistory }) {
  return createRouter({
    routeTree,
    history: options.history,
    context: { queryClient: options.queryClient },
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
