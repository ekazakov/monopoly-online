import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
// The app (and with it `@hono/zod-openapi`) loads before `@monopoly/shared`, as the zod extension needs.
import {
  createTestApp,
  postJson,
  sendAs,
  sessionCookieFrom,
  signIn,
} from "../auth/test-helpers.ts";
import { apiErrorSchema, createSessionResponseSchema } from "@monopoly/shared";
import type { Kysely } from "kysely";
import { SESSION_TTL_MS, TOUCH_INTERVAL_MS, hashToken } from "../auth/index.ts";
import type { Database } from "../db/schema.ts";
import { SESSION_COOKIE } from "./common.ts";

const START = new Date("2026-01-01T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

describe("session routes", () => {
  let db: Kysely<Database>;
  let app: Awaited<ReturnType<typeof createTestApp>>["app"];
  let clock: Date;

  const setup = async (nodeEnv = "test") => {
    ({ app, db } = await createTestApp({ now: () => clock, nodeEnv }));
  };
  const errorCode = async (res: Response) => apiErrorSchema.parse(await res.json()).error.code;

  beforeEach(async () => {
    clock = new Date(START);
    await setup();
  });

  afterEach(async () => {
    await db.destroy();
  });

  describe("POST /api/session", () => {
    test("creates the user and sets the session cookie", async () => {
      const res = await postJson(app, "/api/session", undefined, { name: "  Ann  " });
      expect(res.status).toBe(201);
      const { user } = createSessionResponseSchema.parse(await res.json());
      expect(user).toMatchObject({ name: "Ann", createdAt: START.toISOString() });
      const rows = await db.selectFrom("users").selectAll().execute();
      expect(rows).toEqual([
        { id: user.id, name: "Ann", name_key: "ann", created_at: START.toISOString() },
      ]);
    });

    test("cookie flags: HttpOnly, SameSite=Lax, Path, Max-Age, no Secure in test", async () => {
      const res = await postJson(app, "/api/session", undefined, { name: "Ann" });
      const header = res.headers.getSetCookie()[0]!;
      expect(header).toMatch(new RegExp(`^${SESSION_COOKIE}=[A-Za-z0-9_-]{43};`));
      expect(header).toContain("HttpOnly");
      expect(header).toContain("SameSite=Lax");
      expect(header).toContain("Path=/");
      expect(header).toContain(`Max-Age=${SESSION_TTL_MS / 1000}`);
      expect(header).not.toContain("Secure");
    });

    test("the cookie is Secure in production and absent of Secure in development", async () => {
      await db.destroy();
      await setup("production");
      const prod = await postJson(app, "/api/session", undefined, { name: "Ann" });
      expect(prod.headers.getSetCookie()[0]).toContain("Secure");

      await db.destroy();
      await setup("development");
      const dev = await postJson(app, "/api/session", undefined, { name: "Ann" });
      expect(dev.headers.getSetCookie()[0]).not.toContain("Secure");
    });

    test("the database holds the token hash and not the token", async () => {
      const { cookie } = await signIn(app, "Ann");
      const token = cookie.slice(SESSION_COOKIE.length + 1);
      const rows = await db.selectFrom("sessions").selectAll().execute();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.token_hash).toBe(hashToken(token));
      expect(rows[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(rows)).not.toContain(token);
      expect(rows[0]).toMatchObject({
        last_used_at: START.toISOString(),
        expires_at: new Date(START.getTime() + SESSION_TTL_MS).toISOString(),
      });
    });

    test("every session gets its own token", async () => {
      const a = await signIn(app, "Ann");
      const b = await signIn(app, "Bo");
      expect(a.cookie).not.toBe(b.cookie);
    });

    test("a name that differs only in case is taken", async () => {
      await signIn(app, "Ann");
      const res = await postJson(app, "/api/session", undefined, { name: "aNN" });
      expect(res.status).toBe(409);
      expect(await errorCode(res)).toBe("name_taken");
      expect(res.headers.getSetCookie()).toEqual([]);
      expect(await db.selectFrom("users").select("id").execute()).toHaveLength(1);
    });

    test("a name taken in a race is also name_taken", async () => {
      // Both requests pass the first check, then one insert hits the unique index.
      const [a, b] = await Promise.all([
        postJson(app, "/api/session", undefined, { name: "Ann" }),
        postJson(app, "/api/session", undefined, { name: "ANN" }),
      ]);
      expect([a.status, b.status].sort((x, y) => x - y)).toEqual([201, 409]);
      const failed = a.status === 409 ? a : b;
      expect(await errorCode(failed)).toBe("name_taken");
      expect(await db.selectFrom("users").select("id").execute()).toHaveLength(1);
      expect(await db.selectFrom("sessions").select("token_hash").execute()).toHaveLength(1);
    });

    test.each([
      ["1 character", { name: "A" }],
      ["17 characters", { name: "A".repeat(17) }],
      ["spaces only", { name: "      " }],
      ["a number", { name: 42 }],
      ["no name", {}],
      ["an extra key", { name: "Ann", admin: true }],
    ])("rejects %s with validation_error", async (_label, body) => {
      const res = await postJson(app, "/api/session", undefined, body);
      expect(res.status).toBe(400);
      expect(await errorCode(res)).toBe("validation_error");
      expect(await db.selectFrom("users").select("id").execute()).toEqual([]);
    });

    test("accepts 2 and 16 characters", async () => {
      expect((await postJson(app, "/api/session", undefined, { name: "Al" })).status).toBe(201);
      expect(
        (await postJson(app, "/api/session", undefined, { name: "B".repeat(16) })).status,
      ).toBe(201);
    });

    test("a valid session cookie gives already_signed_in", async () => {
      const { cookie } = await signIn(app, "Ann");
      const res = await postJson(app, "/api/session", cookie, { name: "Bo" });
      expect(res.status).toBe(409);
      expect(await errorCode(res)).toBe("already_signed_in");
      expect(await db.selectFrom("users").select("id").execute()).toHaveLength(1);
    });

    test("an unknown cookie does not block sign-in", async () => {
      const res = await postJson(app, "/api/session", `${SESSION_COOKIE}=garbage`, { name: "Ann" });
      expect(res.status).toBe(201);
      expect(sessionCookieFrom(res)).toBeDefined();
    });

    test("an expired cookie does not block sign-in", async () => {
      const { cookie } = await signIn(app, "Ann");
      clock = new Date(START.getTime() + SESSION_TTL_MS + 1);
      const res = await postJson(app, "/api/session", cookie, { name: "Bo" });
      expect(res.status).toBe(201);
      expect(sessionCookieFrom(res)).not.toBe(cookie);
      expect(await db.selectFrom("sessions").select("token_hash").execute()).toHaveLength(1);
    });
  });

  describe("GET /api/me", () => {
    test("returns the user with the cookie", async () => {
      const { cookie, user } = await signIn(app, "Ann");
      const res = await sendAs(app, "GET", "/api/me", cookie);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ user });
    });

    test("returns 401 without a cookie", async () => {
      const res = await sendAs(app, "GET", "/api/me");
      expect(res.status).toBe(401);
      expect(await errorCode(res)).toBe("unauthorized");
    });

    test("returns 401 with a garbage cookie", async () => {
      const res = await sendAs(app, "GET", "/api/me", `${SESSION_COOKIE}=not-a-session`);
      expect(res.status).toBe(401);
      expect(await errorCode(res)).toBe("unauthorized");
    });

    test("an expired session gives 401 and the row is removed", async () => {
      const { cookie } = await signIn(app, "Ann");
      clock = new Date(START.getTime() + SESSION_TTL_MS);
      const res = await sendAs(app, "GET", "/api/me", cookie);
      expect(res.status).toBe(401);
      expect(await errorCode(res)).toBe("unauthorized");
      expect(await db.selectFrom("sessions").select("token_hash").execute()).toEqual([]);
      // The user stays.
      expect(await db.selectFrom("users").select("id").execute()).toHaveLength(1);
    });

    test("a session that expires in one millisecond still works", async () => {
      const { cookie } = await signIn(app, "Ann");
      clock = new Date(START.getTime() + SESSION_TTL_MS - 1);
      expect((await sendAs(app, "GET", "/api/me", cookie)).status).toBe(200);
    });

    test("use pushes the expiry forward at most once per minute", async () => {
      const { cookie } = await signIn(app, "Ann");
      const row = () => db.selectFrom("sessions").selectAll().executeTakeFirstOrThrow();

      clock = new Date(START.getTime() + TOUCH_INTERVAL_MS - 1);
      const early = await sendAs(app, "GET", "/api/me", cookie);
      expect(early.status).toBe(200);
      expect(early.headers.getSetCookie()).toEqual([]);
      expect(await row()).toMatchObject({
        last_used_at: START.toISOString(),
        expires_at: new Date(START.getTime() + SESSION_TTL_MS).toISOString(),
      });

      clock = new Date(START.getTime() + TOUCH_INTERVAL_MS);
      const touched = await sendAs(app, "GET", "/api/me", cookie);
      expect(touched.status).toBe(200);
      // The cookie slides with the session.
      expect(touched.headers.getSetCookie()[0]).toContain(`Max-Age=${SESSION_TTL_MS / 1000}`);
      expect(await row()).toMatchObject({
        last_used_at: clock.toISOString(),
        expires_at: new Date(clock.getTime() + SESSION_TTL_MS).toISOString(),
      });
    });

    test("a session in use never expires", async () => {
      const { cookie } = await signIn(app, "Ann");
      for (let i = 0; i < 4; i++) {
        clock = new Date(clock.getTime() + 20 * DAY);
        expect((await sendAs(app, "GET", "/api/me", cookie)).status).toBe(200);
      }
      // 80 days after sign-in.
      expect(clock.getTime() - START.getTime()).toBeGreaterThan(SESSION_TTL_MS);
    });
  });

  describe("DELETE /api/session", () => {
    test("removes the session row, clears the cookie and ends the session", async () => {
      const { cookie } = await signIn(app, "Ann");
      const res = await sendAs(app, "DELETE", "/api/session", cookie);
      expect(res.status).toBe(204);
      expect(await res.text()).toBe("");
      const cleared = res.headers.getSetCookie().at(-1)!;
      expect(cleared).toContain(`${SESSION_COOKIE}=;`);
      expect(cleared).toContain("Max-Age=0");
      expect(cleared).toContain("Path=/");
      expect(await db.selectFrom("sessions").select("token_hash").execute()).toEqual([]);

      const me = await sendAs(app, "GET", "/api/me", cookie);
      expect(me.status).toBe(401);
    });

    test("keeps the other sessions of the user", async () => {
      const { cookie } = await signIn(app, "Ann");
      const other = await db.selectFrom("users").select("id").executeTakeFirstOrThrow();
      await db
        .insertInto("sessions")
        .values({
          token_hash: "other",
          user_id: other.id,
          expires_at: new Date(START.getTime() + DAY).toISOString(),
          last_used_at: START.toISOString(),
        })
        .execute();
      await sendAs(app, "DELETE", "/api/session", cookie);
      const rows = await db.selectFrom("sessions").select("token_hash").execute();
      expect(rows).toEqual([{ token_hash: "other" }]);
    });

    test("returns 401 without a valid session", async () => {
      const none = await sendAs(app, "DELETE", "/api/session");
      expect(none.status).toBe(401);
      expect(await errorCode(none)).toBe("unauthorized");
      const garbage = await sendAs(app, "DELETE", "/api/session", `${SESSION_COOKIE}=x`);
      expect(garbage.status).toBe(401);
    });

    test("the name is free again only if the user is gone: sign-out keeps the user", async () => {
      const { cookie } = await signIn(app, "Ann");
      await sendAs(app, "DELETE", "/api/session", cookie);
      const res = await postJson(app, "/api/session", undefined, { name: "Ann" });
      expect(res.status).toBe(409);
      expect(await errorCode(res)).toBe("name_taken");
    });
  });

  describe("public routes", () => {
    test("health and unknown routes need no session", async () => {
      expect((await sendAs(app, "GET", "/api/health")).status).toBe(200);
      const missing = await sendAs(app, "GET", "/api/nope");
      expect(missing.status).toBe(404);
      expect(await errorCode(missing)).toBe("not_found");
    });
  });
});
