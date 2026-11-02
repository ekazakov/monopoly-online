import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { errorBody } from "../errors.ts";
import type { AppDeps, AppEnv } from "../routes/common.ts";
import { readSessionToken, setSessionCookie } from "./cookie.ts";
import { resolveSession } from "./sessions.ts";

/**
 * Session check for protected routes. Sets `c.get("user")` or answers 401 `unauthorized`.
 *
 * A route file applies it to its own paths, before the routes:
 *
 *   new OpenAPIHono<AppEnv>().use("/games/*", requireSession(deps)).openapi(route, handler)
 *
 * Give the path of the route group. A bare `.use(requireSession(deps))` would also cover the
 * routes that are mounted after this file, `POST /api/session` among them.
 */
export function requireSession(deps: Pick<AppDeps, "db" | "now" | "nodeEnv">) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const token = readSessionToken(c);
    const session = token ? await resolveSession(deps, token) : null;
    if (!token || !session) {
      return c.json(errorBody("unauthorized", "Sign in first"), 401);
    }
    // The cookie must slide with the session, or the browser drops it 30 days after sign-in.
    if (session.touched) setSessionCookie(c, token, deps.nodeEnv);
    c.set("user", session.user);
    await next();
  });
}

const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

/** Split a comma list such as the `ALLOWED_ORIGINS` env value. */
export const parseOrigins = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);

const firstValue = (header: string | undefined) => header?.split(",")[0]?.trim() || undefined;

/**
 * Refuses a state-changing request whose `Origin` header is not allowed (403 `forbidden_origin`).
 * Allowed: the request URL origin, the `X-Forwarded-Host` or `Host` host, the `extraOrigins`,
 * and the Vite dev server when `nodeEnv` is `development`. A missing `Origin` passes:
 * SameSite=Lax cookies and JSON-only bodies already stop cross-site forms.
 */
export function checkOrigin(options: {
  extraOrigins: string[];
  nodeEnv: string | undefined;
}): MiddlewareHandler {
  const fixed = new Set([
    ...options.extraOrigins,
    ...(options.nodeEnv === "development" ? DEV_ORIGINS : []),
  ]);
  return async (c, next) => {
    const origin = c.req.header("origin");
    if (origin === undefined || !STATE_CHANGING.has(c.req.method)) return next();

    const url = new URL(c.req.url);
    const protocol = firstValue(c.req.header("x-forwarded-proto")) ?? url.protocol.replace(":", "");
    const host = firstValue(c.req.header("x-forwarded-host")) ?? c.req.header("host");
    const allowed = new Set(fixed);
    allowed.add(url.origin);
    if (host) allowed.add(`${protocol}://${host}`);

    if (!allowed.has(origin)) {
      return c.json(errorBody("forbidden_origin", "Request origin is not allowed"), 403);
    }
    return next();
  };
}
