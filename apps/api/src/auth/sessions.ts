import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { User } from "@monopoly/shared";
import type { AppDeps } from "../routes/common.ts";
import type { Database, User as UserRow } from "../db/schema.ts";
import type { Kysely } from "kysely";

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

type Trx = Kysely<Database>;

/** Insert a user row and a session row. Returns the session token. Call inside a transaction. */
async function insertUserWithSession(trx: Trx, row: UserRow, time: Date) {
  const token = generateToken();
  await trx.insertInto("users").values(row).execute();
  await insertSession(trx, row.id, token, time);
  return token;
}

async function insertSession(trx: Trx, userId: string, token: string, time: Date) {
  await trx
    .insertInto("sessions")
    .values({
      token_hash: hashToken(token),
      user_id: userId,
      expires_at: new Date(time.getTime() + SESSION_TTL_MS).toISOString(),
      last_used_at: time.toISOString(),
      created_at: time.toISOString(),
    })
    .execute();
}

const newUserRow = (name: string, time: Date): UserRow => ({
  id: randomUUID(),
  name,
  name_key: nameKey(name),
  created_at: time.toISOString(),
});

/** Create a guest user and a session. Returns null when the name is taken (case-insensitive). */
export async function createGuestSession(deps: SessionDeps, name: string) {
  const { db, now } = deps;
  const key = nameKey(name);
  if (await nameIsTaken(deps, key)) return null;

  const row = newUserRow(name, now());
  try {
    const token = await db.transaction().execute((trx) => insertUserWithSession(trx, row, now()));
    return { token, user: toApiUser(row) };
  } catch (error) {
    // Two requests with the same name can pass the first check together. The unique
    // index refuses the second insert. Checking again keeps the code database-neutral.
    if (await nameIsTaken(deps, key)) return null;
    throw error;
  }
}

export const GOOGLE_PROVIDER = "google";

/** The user that a Google subject belongs to, or undefined for a subject we have not seen. */
async function findGoogleUser({ db }: SessionDeps, subject: string) {
  return db
    .selectFrom("auth_identities")
    .innerJoin("users", "users.id", "auth_identities.user_id")
    .select(["users.id", "users.name", "users.name_key", "users.created_at"])
    .where("auth_identities.provider", "=", GOOGLE_PROVIDER)
    .where("auth_identities.subject", "=", subject)
    .executeTakeFirst();
}

/** Start a new session for the user of a known Google subject. Returns null for an unknown subject. */
export async function createSessionForGoogleSubject(deps: SessionDeps, subject: string) {
  const found = await findGoogleUser(deps, subject);
  if (!found) return null;
  const token = generateToken();
  await insertSession(deps.db, found.id, token, deps.now());
  return { token, user: toApiUser(found) };
}

/**
 * Create the user, the identity row and the session of a new Google subject in one transaction.
 * The user chooses the name; the Google name is not used. Returns null when the name is taken.
 */
export async function createGoogleUserSession(deps: SessionDeps, subject: string, name: string) {
  const { db, now } = deps;
  const key = nameKey(name);
  if (await nameIsTaken(deps, key)) return null;

  const time = now();
  const row = newUserRow(name, time);
  try {
    const token = await db.transaction().execute(async (trx) => {
      const created = await insertUserWithSession(trx, row, time);
      await trx
        .insertInto("auth_identities")
        .values({
          id: randomUUID(),
          provider: GOOGLE_PROVIDER,
          subject,
          user_id: row.id,
          created_at: time.toISOString(),
        })
        .execute();
      return created;
    });
    return { token, user: toApiUser(row) };
  } catch (error) {
    if (await nameIsTaken(deps, key)) return null;
    throw error;
  }
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
