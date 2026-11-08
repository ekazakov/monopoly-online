import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";
import type { Logger } from "./log.ts";
import type { Metrics } from "./metrics.ts";
import type { AppEnv } from "./routes/common.ts";

export const REQUEST_ID_HEADER = "X-Request-Id";

/** An incoming id is kept only when it is short and safe to put in a log line and a header. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

/** Probes that run often. Their log line is `debug`, so it does not fill the log. */
const QUIET_ROUTES = new Set(["/api/health", "/api/ready"]);

export const readRequestId = (incoming: string | undefined) =>
  incoming !== undefined && SAFE_REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();

/**
 * Set the first middleware of the app, so refused requests are covered too. It:
 * - sets `X-Request-Id` on the response, from a safe incoming value or a new id;
 * - puts the id and a child logger in the context (`c.get("requestId")`, `c.get("log")`);
 * - writes one line for each request with the route template, never the raw path (a raw path
 *   has ids in it and would make a new label value for each game).
 * An SSE response is logged when its headers are sent. The stream route logs open and close.
 */
export function requestLog(log: Logger, metrics?: Metrics) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const started = performance.now();
    const requestId = readRequestId(c.req.header(REQUEST_ID_HEADER));
    // Before `next()`, so error, 404 and SSE responses carry the header too.
    c.header(REQUEST_ID_HEADER, requestId);
    c.set("requestId", requestId);
    c.set("log", log.child({ requestId }));
    try {
      await next();
    } finally {
      // The last matched route is the handler. When no handler matched, it is a wildcard.
      const route = routePath(c, -1);
      const status = c.res.status;
      metrics?.httpRequest({
        method: c.req.method,
        route,
        status,
        seconds: (performance.now() - started) / 1000,
      });
      const level = QUIET_ROUTES.has(route) ? "debug" : status >= 500 ? "error" : "info";
      c.get("log")[level](
        {
          method: c.req.method,
          route,
          status,
          durationMs: Math.round(performance.now() - started),
        },
        "request",
      );
    }
  });
}
