import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { createDb } from "./db/client.ts";
import { migrateToLatest } from "./db/migrations.ts";

const port = Number(process.env.PORT ?? 8787);
const dbPath = process.env.DB_PATH ?? "data/monopoly.db";

mkdirSync(dirname(dbPath), { recursive: true });
const db = createDb(dbPath);
await migrateToLatest(db);

serve({ fetch: createApp(db).fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});
