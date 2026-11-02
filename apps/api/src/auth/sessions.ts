import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { User } from "@monopoly/shared";
import type { AppDeps } from "../routes/common.ts";
import type { User as UserRow } from "../db/schema.ts";

/** A session ends after 30 days without use. The cookie has the same Max-Age. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** A request writes `last_used_at` and `expires_at` at most once per interval. */
export const TOUCH_INTERVAL_MS = 60 * 1000;

type SessionDeps = Pick<AppDeps, "db" | "now">;

export const generateToken = () => randomBytes(32).toString("base64url");

/** The database keeps this hash, never the token. */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export const nameKey = (name: string) => name.trim().toLowerCase();

export const toApiUser = (row: UserRow): User => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at,
});

async function nameIsTaken({ db }: SessionDeps, key: string) {
  const row = await db
    .selectFrom("users")
    .select("id")
    .where("name_key", "=", key)
    .executeTakeFirst();
  return row !== undefined;
}

/** Create a guest user and a session. Returns null when the name is taken (case-insensitive). */
export async function createGuestSession(deps: SessionDeps, name: string) {
  const { db, now } = deps;
  const key = nameKey(name);
  if (await nameIsTaken(deps, key)) return null;

  const token = generateToken();
  const time = now();
  const row: UserRow = {
    id: randomUUID(),
    name,
    name_key: key,
    created_at: time.toISOString(),
  };
  try {
    await db.transaction().execute(async (trx) => {
      await trx.insertInto("users").values(row).execute();
      await trx
        .insertInto("sessions")
        .values({
          token_hash: hashToken(token),
          user_id: row.id,
          expires_at: new Date(time.getTime() + SESSION_TTL_MS).toISOString(),
          last_used_at: time.toISOString(),
          created_at: time.toISOString(),
        })
        .execute();
    });
  } catch (error) {
    // Two requests with the same name can pass the first check together. The unique
    // index refuses the second insert. Checking again keeps the code database-neutral.
    if (await nameIsTaken(deps, key)) return null;
    throw error;
  }
  return { token, user: toApiUser(row) };
}

/**
 * Find the user of a session token. An expired session is deleted. A valid session slides:
 * `touched` is true when this call pushed the expiry forward, so the caller can renew the cookie.
 */
export async function resolveSession(deps: SessionDeps, token: string) {
  const { db, now } = deps;
  const tokenHash = hashToken(token);
  const found = await db
    .selectFrom("sessions")
    .innerJoin("users", "users.id", "sessions.user_id")
    .select([
      "sessions.expires_at",
      "sessions.last_used_at",
      "users.id",
      "users.name",
      "users.name_key",
      "users.created_at",
    ])
    .where("sessions.token_hash", "=", tokenHash)
    .executeTakeFirst();
  if (!found) return null;

  const time = now().getTime();
  if (Date.parse(found.expires_at) <= time) {
    await db.deleteFrom("sessions").where("token_hash", "=", tokenHash).execute();
    return null;
  }

  const touched = time - Date.parse(found.last_used_at) >= TOUCH_INTERVAL_MS;
  if (touched) {
    await db
      .updateTable("sessions")
      .set({
        last_used_at: new Date(time).toISOString(),
        expires_at: new Date(time + SESSION_TTL_MS).toISOString(),
      })
      .where("token_hash", "=", tokenHash)
      .execute();
  }
  return { user: toApiUser(found), touched };
}

export async function deleteSession({ db }: SessionDeps, token: string) {
  await db.deleteFrom("sessions").where("token_hash", "=", hashToken(token)).execute();
}
