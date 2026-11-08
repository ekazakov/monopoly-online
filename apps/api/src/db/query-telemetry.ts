import { SpanKind, SpanStatusCode, context, trace, type Meter } from "@opentelemetry/api";
import type { LogEvent } from "kysely";
import { createQueryDuration } from "../metrics.ts";
import { getTracer } from "../tracing.ts";

/** `SELECT games`, from the text of the query. The parameters are never read. */
export function describeQuery(sql: string): { operation: string; table?: string } {
  const operation = (/^\s*(\w+)/.exec(sql)?.[1] ?? "query").toUpperCase();
  const table = /\b(?:from|into|update)\s+["`]?(\w+)["`]?/i.exec(sql)?.[1];
  return table ? { operation, table } : { operation };
}

/**
 * The `log` option of Kysely. Kysely and `better-sqlite3` have no official instrumentation, and
 * the hook sees every query, also a failed one.
 * - Metric: the duration of every query, with the operation and the table.
 * - Span: one `CLIENT` span for each query that runs inside a request. The event comes after
 *   the query, so the span starts in the past, `queryDurationMillis` before now. A query with no
 *   active span (the migrations at start) makes no span. The span has the query text with its
 *   placeholders and never the parameter values.
 * `meter` defaults to the global meter.
 */
export function createQueryObserver(meter?: Meter): (event: LogEvent) => void {
  const duration = createQueryDuration(meter);
  return (event) => {
    const { operation, table } = describeQuery(event.query.sql);
    duration.record(event.queryDurationMillis / 1000, {
      "db.system.name": "sqlite",
      "db.operation.name": operation,
      ...(table ? { "db.collection.name": table } : {}),
    });
    if (trace.getActiveSpan()) recordQuerySpan(event, operation, table);
  };
}

function recordQuerySpan(event: LogEvent, operation: string, table: string | undefined): void {
  const end = new Date();
  const start = new Date(end.getTime() - event.queryDurationMillis);
  const span = getTracer().startSpan(
    table ? `${operation} ${table}` : operation,
    {
      kind: SpanKind.CLIENT,
      startTime: start,
      attributes: {
        "db.system.name": "sqlite",
        "db.operation.name": operation,
        ...(table ? { "db.collection.name": table } : {}),
        "db.query.text": event.query.sql,
      },
    },
    context.active(),
  );
  if (event.level === "error") {
    span.recordException(event.error instanceof Error ? event.error : String(event.error));
    span.setStatus({ code: SpanStatusCode.ERROR });
  }
  span.end(end);
}
