import type { User } from "@monopoly/shared";
import type { Kysely } from "kysely";
import { createApp, type AppOptions, type AppType } from "../app.ts";
import { createDb } from "../db/client.ts";
import { migrateToLatest } from "../db/migrations.ts";
import type { Database } from "../db/schema.ts";
import { SESSION_COOKIE } from "../routes/common.ts";

/**
 * An app on a fresh in-memory database. Guest sign-in is on, so `signIn` works; pass
 * `auth: { guest: false }` to turn it off. Call `db.destroy()` in `afterEach`.
 */
export async function createTestApp(options?: AppOptions) {
  const db: Kysely<Database> = createDb(":memory:");
  await migrateToLatest(db);
  return { app: createApp(db, { ...options, auth: { guest: true, ...options?.auth } }), db };
}

type Requester = Pick<AppType, "request">;

/** The `Cookie` request header value (`name=token`) from a response that set the session cookie. */
export function sessionCookieFrom(res: Response): string | undefined {
  const header = res.headers.getSetCookie().findLast((h) => h.startsWith(`${SESSION_COOKIE}=`));
  return header?.split(";")[0];
}

/** Sign in as a new guest. Returns the `Cookie` header value and the user. */
export async function signIn(
  app: Requester,
  name: string,
): Promise<{ cookie: string; user: User }> {
  const res = await postJson(app, "/api/session", undefined, { name });
  const cookie = sessionCookieFrom(res);
  if (res.status !== 201 || !cookie) {
    throw new Error(`signIn failed for "${name}": ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { user: User };
  return { cookie, user: body.user };
}

/** `POST` a JSON body. `cookie` is the value from `signIn`; pass `undefined` for no session. */
export function postJson(app: Requester, path: string, cookie: string | undefined, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

/** A request without a body (`GET`, `DELETE`, or a `POST` that needs none). */
export function sendAs(
  app: Requester,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  cookie?: string,
) {
  return app.request(path, { method, headers: cookie ? { cookie } : {} });
}
