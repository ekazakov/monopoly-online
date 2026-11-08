import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { SESSION_COOKIE } from "../routes/common.ts";
import { SESSION_TTL_MS } from "./sessions.ts";

// Plain HTTP is only used in local development and tests.
const isSecure = (nodeEnv: string | undefined) => nodeEnv !== "development" && nodeEnv !== "test";

export const readSessionToken = (c: Context) => getCookie(c, SESSION_COOKIE);

export function setSessionCookie(c: Context, token: string, nodeEnv: string | undefined) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
    secure: isSecure(nodeEnv),
  });
}

export function clearSessionCookie(c: Context, nodeEnv: string | undefined) {
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: isSecure(nodeEnv) });
}

/** Where the Google sign-in cookies live. They are only sent to the Google routes. */
export const GOOGLE_COOKIE_PATH = "/api/auth/google";
const GOOGLE_COOKIE_MAX_AGE_S = 10 * 60;

/** A short-lived cookie of the Google sign-in (`state`, PKCE verifier, pending sign-in). */
export function setGoogleCookie(
  c: Context,
  name: string,
  value: string,
  nodeEnv: string | undefined,
) {
  setCookie(c, name, value, {
    httpOnly: true,
    sameSite: "Lax",
    path: GOOGLE_COOKIE_PATH,
    maxAge: GOOGLE_COOKIE_MAX_AGE_S,
    secure: isSecure(nodeEnv),
  });
}

export const readGoogleCookie = (c: Context, name: string) => getCookie(c, name);

export function clearGoogleCookie(c: Context, name: string, nodeEnv: string | undefined) {
  deleteCookie(c, name, { path: GOOGLE_COOKIE_PATH, secure: isSecure(nodeEnv) });
}
