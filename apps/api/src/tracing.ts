import {
  SpanKind,
  SpanStatusCode,
  context,
  propagation,
  trace,
  type Attributes,
  type Span,
} from "@opentelemetry/api";
import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";
import type { AppEnv } from "./routes/common.ts";

/**
 * The tracer of the API. It is a no-op until `telemetry.ts` registers the SDK, so code can use it
 * with telemetry off. Spans carry no client IP, no user agent and no URL (a URL can hold an OAuth
 * `code`), only the attributes that are set in this file and by the callers of `inSpan`.
 * It is a function and not a constant: a tracer that was got before the SDK started keeps its
 * first provider for ever, and the tests install a new provider in each test.
 */
export const getTracer = () => trace.getTracer("harborfront-api");

export function recordFault(span: Span, error: unknown): void {
  span.recordException(error instanceof Error ? error : String(error));
  span.setStatus({ code: SpanStatusCode.ERROR });
}

/**
 * Runs `run` in a new active span and ends the span after it. A thrown error is recorded on the
 * span and set to `ERROR`, unless `expected(error)` is true: a refusal by the game rules is an
 * answer, not a fault. The error is thrown again.
 */
export function inSpan<T>(
  name: string,
  attributes: Attributes,
  run: (span: Span) => Promise<T>,
  expected: (error: unknown) => boolean = () => false,
): Promise<T> {
  return getTracer().startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await run(span);
    } catch (error) {
      if (!expected(error)) recordFault(span, error);
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * One `SERVER` span for each request, the parent of the spans below it (game action, queries).
 * - It continues a trace from a `traceparent` header.
 * - The name is `METHOD route template`, for example `GET /api/games/:id`, and never the raw path.
 * - A response with status 500 or more sets the span to `ERROR`.
 * Put it first on the app, so the request log runs inside the span.
 */
export function httpTracing() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const method = c.req.method;
    const parent = propagation.extract(context.active(), c.req.header());
    await getTracer().startActiveSpan(
      method,
      { kind: SpanKind.SERVER, attributes: { "http.request.method": method } },
      parent,
      async (span) => {
        try {
          await next();
        } catch (error) {
          recordFault(span, error);
          throw error;
        } finally {
          // The route that answered: the last handler that ran, as in `request-log.ts`.
          const route = routePath(c);
          const status = c.res.status;
          span.updateName(`${method} ${route}`);
          span.setAttributes({
            "http.route": route,
            "http.response.status_code": status,
            "harborfront.request_id": c.get("requestId"),
          });
          if (status >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
          span.end();
        }
      },
    );
  });
}
