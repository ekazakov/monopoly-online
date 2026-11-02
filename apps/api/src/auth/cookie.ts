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
