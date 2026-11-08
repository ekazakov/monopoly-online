import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
// The app (and with it `@hono/zod-openapi`) loads before `@monopoly/shared`, as the zod extension needs.
import {
  createTestApp,
  postJson,
  sendAs,
  sessionCookieFrom,
  signIn,
} from "../auth/test-helpers.ts";
import { apiErrorSchema, authMethodsSchema } from "@monopoly/shared";
import type { Kysely } from "kysely";
import { PENDING_TTL_MS, type GoogleProvider } from "../auth/index.ts";
import type { Database } from "../db/schema.ts";
import { SESSION_COOKIE } from "./common.ts";

const REDIRECT_URI = "http://localhost:5173/api/auth/google/callback";

/** A Google that needs no network. `exchange` returns the subject that the test sets. */
function fakeGoogle() {
  const fake = {
    subject: "google-subject-1",
    fail: false,
    exchanged: [] as { code: string; verifier: string }[],
  };
  const provider: GoogleProvider = {
    authorizationUrl(state, verifier) {
      const url = new URL("https://accounts.example.test/auth");
      url.searchParams.set("state", state);
      url.searchParams.set("verifier", verifier);
      url.searchParams.set("redirect_uri", REDIRECT_URI);
      return url;
    },
    async exchange(code, verifier) {
      fake.exchanged.push({ code, verifier });
      if (fake.fail) throw new Error("Google refused the code");
      return { subject: fake.subject };
    },
  };
  return { fake, provider };
}

const errorCode = async (res: Response) => apiErrorSchema.parse(await res.json()).error.code;

/** `name=value` pairs of the cookies that a response sets, ready for a `Cookie` header. */
function cookiesFrom(res: Response) {
  const pairs = new Map<string, string>();
  for (const header of res.headers.getSetCookie()) {
    const [pair] = header.split(";");
    const [name, ...value] = pair!.split("=");
    pairs.set(name!, value.join("="));
  }
  return pairs;
}
const cookieHeader = (pairs: Map<string, string>) =>
  [...pairs].map(([name, value]) => `${name}=${value}`).join("; ");

describe("sign-in methods", () => {
  let db: Kysely<Database>;
  afterEach(async () => {
    await db.destroy();
  });

  test("reports guest only", async () => {
    let app;
    ({ app, db } = await createTestApp());
    const res = await sendAs(app, "GET", "/api/auth/methods");
    expect(res.status).toBe(200);
    expect(authMethodsSchema.parse(await res.json())).toEqual({ google: false, guest: true });
  });

  test("reports Google only", async () => {
    let app;
    ({ app, db } = await createTestApp({
      auth: { guest: false, google: fakeGoogle().provider },
    }));
    const res = await sendAs(app, "GET", "/api/auth/methods");
    expect(authMethodsSchema.parse(await res.json())).toEqual({ google: true, guest: false });
  });

  test("reports both", async () => {
    let app;
    ({ app, db } = await createTestApp({ auth: { google: fakeGoogle().provider } }));
    const res = await sendAs(app, "GET", "/api/auth/methods");
    expect(authMethodsSchema.parse(await res.json())).toEqual({ google: true, guest: true });
  });
});

describe("guest sign-in switch", () => {
  let db: Kysely<Database>;
  afterEach(async () => {
    await db.destroy();
  });

  test("POST /api/session answers 404 when guest sign-in is off", async () => {
    let app;
    ({ app, db } = await createTestApp({ auth: { guest: false, google: fakeGoogle().provider } }));
    const res = await postJson(app, "/api/session", undefined, { name: "Ada" });
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe("not_found");
    expect(sessionCookieFrom(res)).toBeUndefined();
    expect(await db.selectFrom("users").select("id").execute()).toHaveLength(0);
  });

  test("the app has guest sign-in off unless it is asked", async () => {
    // `createTestApp` turns it on; `createApp` itself does not.
    const { createApp } = await import("../app.ts");
    const { createDb } = await import("../db/client.ts");
    const { migrateToLatest } = await import("../db/migrations.ts");
    db = createDb(":memory:");
    await migrateToLatest(db);
    const res = await postJson(createApp(db), "/api/session", undefined, { name: "Ada" });
    expect(res.status).toBe(404);
  });
});

describe("Google sign-in", () => {
  let db: Kysely<Database>;
  let app: Awaited<ReturnType<typeof createTestApp>>["app"];
  let fake: ReturnType<typeof fakeGoogle>["fake"];
  let clock: Date;

  beforeEach(async () => {
    clock = new Date("2026-01-01T00:00:00.000Z");
    const google = fakeGoogle();
    fake = google.fake;
    ({ app, db } = await createTestApp({
      now: () => clock,
      auth: { guest: true, google: google.provider },
    }));
  });
  afterEach(async () => {
    await db.destroy();
  });

  /** Run `start` and return the cookies it set and the `state` that went to Google. */
  async function start(cookie?: string) {
    const res = await sendAs(app, "GET", "/api/auth/google/start", cookie);
    return { res, cookies: cookiesFrom(res) };
  }

  async function callback(cookies: Map<string, string>, query: Record<string, string>) {
    const params = new URLSearchParams(query);
    return app.request(`/api/auth/google/callback?${params.toString()}`, {
      headers: { cookie: cookieHeader(cookies) },
    });
  }

  /** The whole trip up to the callback for a subject that has no user yet. */
  async function arriveAsNewUser() {
    const { res, cookies } = await start();
    const state = new URL(res.headers.get("location")!).searchParams.get("state")!;
    const back = await callback(cookies, { code: "code-1", state });
    return { back, cookies: cookiesFrom(back) };
  }

  describe("start", () => {
    test("sets the state and PKCE cookies and goes to Google", async () => {
      const { res, cookies } = await start();
      expect(res.status).toBe(302);
      const location = new URL(res.headers.get("location")!);
      expect(location.origin).toBe("https://accounts.example.test");
      expect(location.searchParams.get("state")).toBe(cookies.get("harborfront_google_state"));
      expect(location.searchParams.get("verifier")).toBe(
        cookies.get("harborfront_google_verifier"),
      );
      for (const header of res.headers.getSetCookie()) {
        expect(header).toMatch(/HttpOnly/i);
        expect(header).toMatch(/SameSite=Lax/i);
        expect(header).toMatch(/Path=\/api\/auth\/google/);
        expect(header).toMatch(/Max-Age=600/);
      }
    });

    test("uses a new state at each start", async () => {
      const first = (await start()).cookies.get("harborfront_google_state");
      const second = (await start()).cookies.get("harborfront_google_state");
      expect(first).not.toBe(second);
    });

    test("refuses a signed-in user", async () => {
      const { cookie } = await signIn(app, "Ada");
      const { res } = await start(cookie);
      expect(res.status).toBe(409);
      expect(await errorCode(res)).toBe("already_signed_in");
    });

    test("answers 404 when Google is off", async () => {
      await db.destroy();
      ({ app, db } = await createTestApp());
      const { res } = await start();
      expect(res.status).toBe(404);
      expect(await errorCode(res)).toBe("not_found");
    });
  });

  describe("callback", () => {
    test("a new subject gets a pending cookie and goes to the name step", async () => {
      const { back, cookies } = await arriveAsNewUser();
      expect(back.status).toBe(302);
      expect(back.headers.get("location")).toBe("/sign-in?step=name");
      expect(cookies.get("harborfront_google_pending")).toBeTruthy();
      expect(cookies.get(SESSION_COOKIE)).toBeUndefined();
      expect(fake.exchanged[0]?.code).toBe("code-1");
      // Google got the verifier that the start route put in the cookie.
      expect(await db.selectFrom("users").select("id").execute()).toHaveLength(0);
    });

    test("clears the state and PKCE cookies", async () => {
      const { cookies } = await arriveAsNewUser();
      expect(cookies.get("harborfront_google_state")).toBe("");
      expect(cookies.get("harborfront_google_verifier")).toBe("");
    });

    test("sends the PKCE verifier of the start to Google", async () => {
      const { res, cookies } = await start();
      const state = new URL(res.headers.get("location")!).searchParams.get("state")!;
      await callback(cookies, { code: "c", state });
      expect(fake.exchanged[0]?.verifier).toBe(cookies.get("harborfront_google_verifier"));
    });

    test("a known subject gets a session and goes to the app", async () => {
      const { cookies: pendingCookies } = await arriveAsNewUser();
      const named = await postJson(app, "/api/auth/google/name", cookieHeader(pendingCookies), {
        name: "Ada",
      });
      expect(named.status).toBe(200);

      const { res, cookies } = await start();
      const state = new URL(res.headers.get("location")!).searchParams.get("state")!;
      const back = await callback(cookies, { code: "code-2", state });
      expect(back.status).toBe(302);
      expect(back.headers.get("location")).toBe("/");
      const session = sessionCookieFrom(back)!;
      const me = await sendAs(app, "GET", "/api/me", session);
      expect(((await me.json()) as { user: { name: string } }).user.name).toBe("Ada");
      // A new session each time: two sign-ins, two tokens.
      expect(session).not.toBe(sessionCookieFrom(named));
      expect(await db.selectFrom("sessions").select("token_hash").execute()).toHaveLength(2);
    });

    test("a bad state goes to the sign-in screen with oauth_failed", async () => {
      const { cookies } = await start();
      const back = await callback(cookies, { code: "code-1", state: "not-the-state" });
      expect(back.status).toBe(302);
      expect(back.headers.get("location")).toBe("/sign-in?error=oauth_failed");
      expect(fake.exchanged).toHaveLength(0);
      expect(cookiesFrom(back).get("harborfront_google_pending")).toBeUndefined();
    });

    test("a missing state cookie fails", async () => {
      const back = await callback(new Map(), { code: "code-1", state: "x" });
      expect(back.headers.get("location")).toBe("/sign-in?error=oauth_failed");
      expect(fake.exchanged).toHaveLength(0);
    });

    test("a missing code or a Google error fails", async () => {
      const { res, cookies } = await start();
      const state = new URL(res.headers.get("location")!).searchParams.get("state")!;
      const noCode = await callback(cookies, { state });
      expect(noCode.headers.get("location")).toBe("/sign-in?error=oauth_failed");
      const denied = await callback(cookies, { state, error: "access_denied" });
      expect(denied.headers.get("location")).toBe("/sign-in?error=oauth_failed");
      expect(fake.exchanged).toHaveLength(0);
    });

    test("a failed exchange fails", async () => {
      fake.fail = true;
      const { back, cookies } = await arriveAsNewUser();
      expect(back.headers.get("location")).toBe("/sign-in?error=oauth_failed");
      expect(cookies.get("harborfront_google_pending")).toBeUndefined();
      expect(cookies.get(SESSION_COOKIE)).toBeUndefined();
    });

    test("a state works once", async () => {
      const { res, cookies } = await start();
      const state = new URL(res.headers.get("location")!).searchParams.get("state")!;
      await callback(cookies, { code: "c", state });
      // The browser dropped the cookies after the first answer; a replay has none.
      const replay = await callback(new Map(), { code: "c", state });
      expect(replay.headers.get("location")).toBe("/sign-in?error=oauth_failed");
    });
  });

  describe("name step", () => {
    test("makes the user, the identity row and the session", async () => {
      const { cookies } = await arriveAsNewUser();
      const res = await postJson(app, "/api/auth/google/name", cookieHeader(cookies), {
        name: "Ada",
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { user: { id: string; name: string } };
      expect(body.user.name).toBe("Ada");
      const session = sessionCookieFrom(res)!;
      expect(session).toBeTruthy();

      const identities = await db.selectFrom("auth_identities").selectAll().execute();
      expect(identities).toHaveLength(1);
      expect(identities[0]).toMatchObject({
        provider: "google",
        subject: "google-subject-1",
        user_id: body.user.id,
      });
      const me = await sendAs(app, "GET", "/api/me", session);
      expect(me.status).toBe(200);
      // The pending cookie is gone.
      expect(cookiesFrom(res).get("harborfront_google_pending")).toBe("");
    });

    test("the pending sign-in works once", async () => {
      const { cookies } = await arriveAsNewUser();
      const header = cookieHeader(cookies);
      expect((await postJson(app, "/api/auth/google/name", header, { name: "Ada" })).status).toBe(
        200,
      );
      const again = await postJson(app, "/api/auth/google/name", header, { name: "Ada Two" });
      expect(again.status).toBe(401);
      expect(await db.selectFrom("users").select("id").execute()).toHaveLength(1);
    });

    test("answers 401 without a pending sign-in", async () => {
      const res = await postJson(app, "/api/auth/google/name", undefined, { name: "Ada" });
      expect(res.status).toBe(401);
      expect(await errorCode(res)).toBe("unauthorized");
    });

    test("answers 401 when the pending sign-in has expired", async () => {
      const { cookies } = await arriveAsNewUser();
      clock = new Date(clock.getTime() + PENDING_TTL_MS + 1);
      const res = await postJson(app, "/api/auth/google/name", cookieHeader(cookies), {
        name: "Ada",
      });
      expect(res.status).toBe(401);
    });

    test("answers 409 when the name is taken and keeps the pending sign-in", async () => {
      await signIn(app, "Ada");
      const { cookies } = await arriveAsNewUser();
      const header = cookieHeader(cookies);
      const taken = await postJson(app, "/api/auth/google/name", header, { name: "ada" });
      expect(taken.status).toBe(409);
      expect(await errorCode(taken)).toBe("name_taken");
      expect(await db.selectFrom("auth_identities").select("id").execute()).toHaveLength(0);

      const retry = await postJson(app, "/api/auth/google/name", header, { name: "Grace" });
      expect(retry.status).toBe(200);
    });

    test("answers 400 for a bad name", async () => {
      const { cookies } = await arriveAsNewUser();
      const res = await postJson(app, "/api/auth/google/name", cookieHeader(cookies), {
        name: "x",
      });
      expect(res.status).toBe(400);
      expect(await errorCode(res)).toBe("validation_error");
    });

    test("checks the Origin header", async () => {
      const { cookies } = await arriveAsNewUser();
      const res = await app.request("/api/auth/google/name", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: cookieHeader(cookies),
          origin: "https://evil.example",
        },
        body: JSON.stringify({ name: "Ada" }),
      });
      expect(res.status).toBe(403);
      expect(await db.selectFrom("users").select("id").execute()).toHaveLength(0);
    });

    test("a guest and a Google user are separate users, even with one name rule", async () => {
      const guest = await signIn(app, "Ada");
      const { cookies } = await arriveAsNewUser();
      const res = await postJson(app, "/api/auth/google/name", cookieHeader(cookies), {
        name: "Grace",
      });
      const google = ((await res.json()) as { user: { id: string } }).user;
      expect(google.id).not.toBe(guest.user.id);
    });
  });
});
