import { OpenAPIHono } from "@hono/zod-openapi";
import type { Kysely } from "kysely";
import type { Database } from "./db/schema.ts";
import { checkOrigin, parseOrigins } from "./auth/index.ts";
import { errorHandler, notFoundHandler, validationHook } from "./errors.ts";
import {
  SESSION_COOKIE,
  resolveDeps,
  type AppEnv,
  type AppOptions as BaseAppOptions,
} from "./routes/common.ts";
import { createGameStateLoader, type GameStateLoader } from "./game/loader.ts";
import { createLifecycleService } from "./game/lifecycle.ts";
import { createGameService } from "./game/service.ts";
import { createBus, type Bus } from "./realtime/bus.ts";
import { createPublishers, type StreamEnvelope } from "./realtime/messages.ts";
import {
  createPresenceTracker,
  readSeatPresence,
  type PresenceTracker,
} from "./realtime/presence.ts";
import { createRoomService, type RoomEvent } from "./rooms/service.ts";
import { gameRoutes } from "./routes/games.ts";
import { gameplayRoutes } from "./routes/gameplay.ts";
import { healthRoutes } from "./routes/health.ts";
import { inviteRoutes } from "./routes/invites.ts";
import { lifecycleRoutes } from "./routes/lifecycle.ts";
import { resultRoutes } from "./routes/result.ts";
import { sessionRoutes } from "./routes/session.ts";
import { streamRoutes } from "./routes/stream.ts";

export type { AppEnv } from "./routes/common.ts";

/** Optional settings of `createApp`. Tests set them; production uses the defaults. */
export type AppOptions = BaseAppOptions & {
  /** Extra origins that may send state-changing requests. Defaults to the `ALLOWED_ORIGINS` env comma list. */
  allowedOrigins?: string[];
  /** Also called after a join, leave, seat change or start has been committed. The app publishes to the bus itself. */
  onRoomEvent?: (event: RoomEvent) => void;
  /** Shared state loader of the room service, the action service and the stream. Defaults to a new one. */
  loader?: GameStateLoader;
  /** The bus that carries the stream messages. Defaults to a new one. Tests pass their own to publish or count subscribers. */
  bus?: Bus<StreamEnvelope>;
  /** Interval of the stream heartbeat comment in ms. Defaults to 15 s. */
  heartbeatMs?: number;
  /** Largest version gap a stream reconnect replays. Defaults to `RESUME_MAX_GAP` (100). */
  resumeMaxGap?: number;
  /** The presence tracker of the game streams. Defaults to a new one that publishes its changes. */
  presence?: PresenceTracker;
  /** Grace time of the default tracker in ms. Defaults to 60 s. Ignored when `presence` is set. */
  presenceGraceMs?: number;
};

export function createApp(db: Kysely<Database>, options?: AppOptions) {
  const deps = resolveDeps(db, options);
  const extraOrigins = options?.allowedOrigins ?? parseOrigins(process.env.ALLOWED_ORIGINS);
  const loader = options?.loader ?? createGameStateLoader(db);
  const bus = options?.bus ?? createBus<StreamEnvelope>();
  const publish = createPublishers(bus);
  const presence =
    options?.presence ?? createPresenceTracker({ graceMs: options?.presenceGraceMs });
  // The full seat map goes to every device of the game on each change.
  presence.subscribe(({ gameId }) => {
    readSeatPresence(db, presence, gameId).then(
      (seats) => publish.onPresence(gameId, seats),
      (error: unknown) => console.error("Presence update failed", error),
    );
  });
  const rooms = createRoomService({
    db,
    now: deps.now,
    seed: deps.seed,
    onRoomEvent: (event) => {
      publish.onRoomEvent(event);
      options?.onRoomEvent?.(event);
    },
    loader,
  });
  const service = createGameService({
    db,
    loader,
    now: deps.now,
    onCommitted: (committed) => publish.onCommitted(committed),
  });
  const lifecycle = createLifecycleService({
    db,
    games: service,
    loader,
    readGame: (gameId) => rooms.get(gameId),
    onSnapshot: (snapshot) => publish.onSnapshot(snapshot),
    onRoomUpdated: (game) => publish.onRoomUpdated(game),
    now: deps.now,
  });
  const api = new OpenAPIHono<AppEnv>({ defaultHook: validationHook }).basePath("/api");
  // Registered before every route, so later routes are covered too. `.use` returns a plain
  // Hono type, so it stays out of the chain that keeps the OpenAPI types.
  api.use(checkOrigin({ extraOrigins, nodeEnv: deps.nodeEnv }));
  const app = api
    .notFound(notFoundHandler)
    .onError(errorHandler)
    .route("/", healthRoutes(deps))
    .route("/", sessionRoutes(deps))
    .route("/", gameRoutes({ ...deps, rooms }))
    .route("/", inviteRoutes({ ...deps, rooms }))
    // After `gameRoutes`: its `/games/*` session middleware also covers these routes, and the
    // handlers read `c.get("user")`.
    .route("/", gameplayRoutes({ ...deps, service }))
    .route("/", lifecycleRoutes({ ...deps, lifecycle }))
    .route("/", resultRoutes({ ...deps, loader }))
    .route(
      "/",
      streamRoutes({
        ...deps,
        rooms,
        loader,
        bus,
        presence,
        heartbeatMs: options?.heartbeatMs,
        resumeMaxGap: options?.resumeMaxGap,
      }),
    );

  app.openAPIRegistry.registerComponent("securitySchemes", "sessionCookie", {
    type: "apiKey",
    in: "cookie",
    name: SESSION_COOKIE,
  });
  return app;
}

export type AppType = ReturnType<typeof createApp>;
