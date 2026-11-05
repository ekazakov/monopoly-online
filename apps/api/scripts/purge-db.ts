// Deletes the SQLite database and its sidecar files. The API makes a new, empty database and runs
// the migrations when it starts. Run: pnpm db:purge (from the repo root), with the API stopped.
// The path is the same as the API uses: DB_PATH, or data/monopoly.db in apps/api.
import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const dbPath = process.env.DB_PATH ?? "data/monopoly.db";

if (dbPath === ":memory:" || dbPath.startsWith("file:")) {
  console.error(`Nothing to purge: DB_PATH is ${dbPath}, which is not a file.`);
  process.exit(1);
}

const base = resolve(dbPath);
// The write-ahead log and the shared-memory file stay beside the database while it is open.
const files = [base, `${base}-shm`, `${base}-wal`, `${base}-journal`];

const removed: string[] = [];
for (const file of files) {
  try {
    // Without `force`, `rm` throws for a file that is not there, and that is how a miss is told
    // from a removal.
    await rm(file);
    removed.push(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

if (removed.length === 0) console.log(`No database at ${base}. Nothing to purge.`);
else for (const file of removed) console.log(`Removed ${file}`);
