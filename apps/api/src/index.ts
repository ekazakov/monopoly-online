import { mkdirSync } from "node:fs";
import type { Server } from "node:http";
import { dirname } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { createArcticGoogle, readAuthConfig } from "./auth/index.ts";
import { createDb } from "./db/client.ts";
import { createQueryObserver } from "./db/query-telemetry.ts";
import { getMeter, registerProcessMetrics } from "./metrics.ts";
import { createLogger } from "./log.ts";
import { migrateToLatest } from "./db/migrations.ts";
import { createPresenceTracker, watchActiveGames } from "./realtime/presence.ts";
import { getTelemetry } from "./otel.ts";
import { serveWeb } from "./web.ts";
import { createShutdownHandle, readShutdownTimeout, runShutdown } from "./shutdown.ts";

const logger = createLogger();

// A fault that nobody handles leaves the process in an unknown state: log it and stop.
// `flush` writes what the logger still holds before the exit.
function exitOnFault(message: string) {
  return (err: unknown) => {
    logger.fatal({ err }, message);
    logger.flush();
    process.exit(1);
  };
}
process.on("unhandledRejection", exitOnFault("unhandled rejection"));
process.on("uncaughtException", exitOnFault("uncaught exception"));

const port = Number(process.env.PORT ?? 8787);
const dbPath = process.env.DB_PATH ?? "data/monopoly.db";

// A wrong sign-in setting stops the start here, before the database opens.
const authConfig = readAuthConfig(process.env);
const shutdownTimeoutMs = readShutdownTimeout(process.env);
// The web build is served by the API only when this is set. Without it the API serves no web files.
const webDistDir = process.env.WEB_DIST_DIR || undefined;

mkdirSync(dirname(dbPath), { recursive: true });
const db = createDb(dbPath, { log: createQueryObserver() });
registerProcessMetrics(getMeter(), { dbPath });
await migrateToLatest(db, logger);

// GAME_SEED is a test-only flag for the end-to-end tests. A fixed integer seed gives every game
// the same dice, shuffled decks and turn order, so it is ignored when NODE_ENV is "production".
const fixedSeed = process.env.GAME_SEED;
const seed =
  fixedSeed !== undefined && fixedSeed !== "" && process.env.NODE_ENV !== "production"
    ? Number(fixedSeed)
    : undefined;
if (seed !== undefined && !Number.isInteger(seed)) {
  throw new Error(`GAME_SEED must be an integer, got "${fixedSeed}"`);
}

// PRESENCE_GRACE_MS is a test-only flag for the end-to-end tests. It shortens the grace time before
// an away player counts as gone, so it is ignored when NODE_ENV is "production".
const fixedGrace = process.env.PRESENCE_GRACE_MS;
const graceMs =
  fixedGrace !== undefined && fixedGrace !== "" && process.env.NODE_ENV !== "production"
    ? Number(fixedGrace)
    : undefined;
if (graceMs !== undefined && !(Number.isInteger(graceMs) && graceMs > 0)) {
  throw new Error(`PRESENCE_GRACE_MS must be a positive integer, got "${fixedGrace}"`);
}

// One line with the settings, and no secrets. Telemetry is on when an OTLP endpoint is set.
logger.info(
  {
    nodeEnv: process.env.NODE_ENV ?? null,
    port,
    dbPath,
    logLevel: logger.level,
    signIn: { guest: authConfig.guest, google: Boolean(authConfig.google) },
    telemetry: getTelemetry() !== undefined,
    fixedSeed: seed !== undefined,
    presenceGraceMs: graceMs ?? null,
    shutdownTimeoutMs,
    webDistDir: webDistDir ?? null,
  },
  "starting",
);

// The tracker is in memory, so a restart forgets who was online. Every controller of an active game
// gets a new grace time, and a game that nobody comes back to saves itself.
const presence = createPresenceTracker(graceMs === undefined ? {} : { graceMs });
const shutdown = createShutdownHandle();
const app = createApp(db, {
  logger,
  shutdown,
  presence,
  auth: {
    guest: authConfig.guest,
    ...(authConfig.google ? { google: createArcticGoogle(authConfig.google) } : {}),
  },
  ...(seed === undefined ? {} : { seed: () => seed }),
});
const watched = await watchActiveGames(db, presence);
if (watched > 0) logger.info({ games: watched }, "watching active games for returning players");

// No `createServer` or `serverOptions` is set, so the server is a plain HTTP/1 `http.Server`.
const handler = webDistDir ? serveWeb(app, { distDir: webDistDir }) : app;
const server = serve({ fetch: handler.fetch, port }, (info) => {
  logger.info({ port: info.port }, "API listening");
}) as Server;

// SIGTERM comes from `docker stop` and SIGINT from Ctrl+C. A second signal stops at once.
let stopping = false;
async function stop(reason: string) {
  if (stopping) {
    logger.warn({ reason }, "second stop signal, exiting now");
    process.exit(1);
  }
  stopping = true;

  let closed: Promise<void> = Promise.resolve();
  const outcome = await runShutdown({
    log: logger,
    reason,
    timeoutMs: shutdownTimeoutMs,
    steps: [
      {
        // No new connections. `close` ends when the last connection ends, so it is not awaited here.
        name: "stop listening",
        run: () => {
          closed = new Promise((resolve) => server.close(() => resolve()));
          server.closeIdleConnections();
        },
      },
      // Before the streams close: their disconnects must not start grace timers or save games.
      { name: "stop presence timers", run: () => presence.close() },
      { name: "close event streams", run: () => shutdown.begin() },
      {
        // A closed stream leaves a keep-alive connection behind, so close the idle ones until done.
        name: "wait for open requests",
        run: async () => {
          const timer = setInterval(() => server.closeIdleConnections(), 100);
          try {
            await closed;
          } finally {
            clearInterval(timer);
          }
        },
      },
      {
        name: "wait for open actions",
        run: () => Promise.all(shutdown.drains.map((drain) => drain())),
      },
      { name: "close database", run: () => db.destroy() },
      // Last, so the spans, metrics and logs of the other steps are exported too.
      { name: "flush telemetry", run: () => getTelemetry()?.shutdown() },
    ],
  });
  if (outcome === "timeout") server.closeAllConnections();
  logger.flush();
  process.exit(outcome === "clean" ? 0 : 1);
}
process.on("SIGTERM", () => void stop("SIGTERM"));
process.on("SIGINT", () => void stop("SIGINT"));
