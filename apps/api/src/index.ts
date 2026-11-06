import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { createDb } from "./db/client.ts";
import { migrateToLatest } from "./db/migrations.ts";
import { createPresenceTracker, watchActiveGames } from "./realtime/presence.ts";

const port = Number(process.env.PORT ?? 8787);
const dbPath = process.env.DB_PATH ?? "data/monopoly.db";

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

// The tracker is in memory, so a restart forgets who was online. Every controller of an active game
// gets a new grace time, and a game that nobody comes back to saves itself.
const presence = createPresenceTracker();
const app = createApp(db, { presence, ...(seed === undefined ? {} : { seed: () => seed }) });
const watched = await watchActiveGames(db, presence);
if (watched > 0) console.log(`Watching ${watched} active game(s) for returning players`);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});
