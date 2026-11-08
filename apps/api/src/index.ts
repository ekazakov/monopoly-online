import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { createArcticGoogle, readAuthConfig } from "./auth/index.ts";
import { createDb } from "./db/client.ts";
import { migrateToLatest } from "./db/migrations.ts";
import { createPresenceTracker, watchActiveGames } from "./realtime/presence.ts";

const port = Number(process.env.PORT ?? 8787);
const dbPath = process.env.DB_PATH ?? "data/monopoly.db";

// A wrong sign-in setting stops the start here, before the database opens.
const authConfig = readAuthConfig(process.env);

mkdirSync(dirname(dbPath), { recursive: true });
const db = createDb(dbPath);
await migrateToLatest(db);

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

// The tracker is in memory, so a restart forgets who was online. Every controller of an active game
// gets a new grace time, and a game that nobody comes back to saves itself.
const presence = createPresenceTracker(graceMs === undefined ? {} : { graceMs });
const app = createApp(db, {
  presence,
  auth: {
    guest: authConfig.guest,
    ...(authConfig.google ? { google: createArcticGoogle(authConfig.google) } : {}),
  },
  ...(seed === undefined ? {} : { seed: () => seed }),
});
const watched = await watchActiveGames(db, presence);
if (watched > 0) console.log(`Watching ${watched} active game(s) for returning players`);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});
