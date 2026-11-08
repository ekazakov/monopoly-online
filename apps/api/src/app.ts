import { OpenAPIHono } from "@hono/zod-openapi";
import type { Kysely } from "kysely";
import type { Database } from "./db/schema.ts";
import {
  checkOrigin,
  createPendingSignIns,
  parseOrigins,
  type GoogleProvider,
} from "./auth/index.ts";
import { requestLog } from "./request-log.ts";
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
  controllersOf,
  createPresenceTracker,
  readSeatPresence,
  type PresenceTracker,
} from "./realtime/presence.ts";
import { createRoomService, type RoomEvent } from "./rooms/service.ts";
import { authRoutes } from "./routes/auth.ts";
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
  /**
   * The sign-in methods. Defaults to none: `POST /api/session` answers 404 and Google is off.
   * `index.ts` reads them from the environment with `readAuthConfig`.
   */
  auth?: {
    /** Turns on guest sign-in (`POST /api/session`). */
    guest?: boolean;
    /** Turns on Google sign-in. Tests pass a fake provider. */
    google?: GoogleProvider;
  };
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
      // The players in the room have streams already. The others get the grace time to arrive.
      if (event.type === "started") {
        presence.watch(event.game.id, controllersOf(event.game.seats), "reconnecting");
      }
      publish.onRoomEvent(event);
      options?.onRoomEvent?.(event);
    },
    loader,
  });
  const service = createGameService({
    db,
    loader,
    now: deps.now,
    onCommitted: (committed) => {
      publish.onCommitted(committed);
      if (committed.events.some((event) => event.type === "GameEnded")) {
        presence.forget(committed.gameId);
      }
    },
  });
  const lifecycle = createLifecycleService({
    db,
    games: service,
    loader,
    readGame: (gameId) => rooms.get(gameId),
    onSnapshot: (snapshot) => publish.onSnapshot(snapshot),
    // Restore: a controller with no open stream is away at once (gameplay 3.1).
    onRestored: (game) => presence.watch(game.id, controllersOf(game.seats), "away"),
    onLeftActive: (gameId) => presence.forget(gameId),
    onRoomUpdated: (game) => publish.onRoomUpdated(game),
    now: deps.now,
  });
  // Nobody online: when the last controller of an active game goes away, the game saves itself.
  // Controllers the tracker does not know have no stream and no grace time, so they count as away.
  const nobodyOnline = async (gameId: string) => {
    const seats = await db
      .selectFrom("seats")
      .select("controller_user_id")
      .where("game_id", "=", gameId)
      .execute();
    return seats.every((seat) => {
      const status = presence.status(gameId, seat.controller_user_id);
      return status === undefined || status === "away";
    });
  };
  presence.subscribe(({ gameId, status }) => {
    if (status !== "away") return;
    lifecycle
      .saveUnattended({ gameId, stillUnattended: () => nobodyOnline(gameId) })
      .catch((error: unknown) => console.error("Automatic save failed", error));
  });
  const guest = options?.auth?.guest ?? false;
  const pending = createPendingSignIns(deps.now);
  const api = new OpenAPIHono<AppEnv>({ defaultHook: validationHook }).basePath("/api");
  // Registered before every route, so later routes are covered too. `.use` returns a plain
  // Hono type, so it stays out of the chain that keeps the OpenAPI types.
  api.use(requestLog(deps.log));
  api.use(checkOrigin({ extraOrigins, nodeEnv: deps.nodeEnv }));
  const app = api
    .notFound(notFoundHandler)
    .onError(errorHandler)
    .route("/", healthRoutes(deps))
    .route("/", sessionRoutes(deps, { guest }))
    .route("/", authRoutes(deps, { guest, google: options?.auth?.google, pending }))
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
