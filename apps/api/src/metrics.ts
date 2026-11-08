import { statSync } from "node:fs";
import { metrics as otelMetrics, type Meter } from "@opentelemetry/api";
import type { PresenceStatus } from "@monopoly/shared";
import type { PresenceTracker } from "./realtime/presence.ts";

export const METER_NAME = "harborfront-api";

/**
 * The meter of the API. It is a no-op until `telemetry.ts` registers the SDK. It is a function and
 * not a constant for the same reason as `getTracer`: the tests install a new provider each time.
 */
export const getMeter = () => otelMetrics.getMeter(METER_NAME);

/** Bucket limits in seconds, for the HTTP and the query durations. */
const DURATION_BUCKETS = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export type ResumeKind = "events" | "snapshot" | "none";

export interface Metrics {
  /** One finished request. `route` is the route template, never the raw path. */
  httpRequest(request: { method: string; route: string; status: number; seconds: number }): void;
  /** An event stream opened. `reconnect` is true when it came with a `Last-Event-ID`. */
  streamOpened(userId: string, reconnect: boolean): void;
  streamClosed(userId: string): void;
  /** What a reconnect with a `Last-Event-ID` got: the missed events, a snapshot or nothing. */
  resumed(kind: ResumeKind): void;
  /** The presence tracker saved a game that nobody was playing. */
  autoSaved(): void;
  /** Report how many users are `online`, `reconnecting` and `away`. */
  observePresence(tracker: Pick<PresenceTracker, "counts">): void;
}

/**
 * The HTTP and realtime metrics. No game metrics: they are not in M5. The names follow the
 * OpenTelemetry conventions where one exists (`http.server.request.duration`), and `harborfront.*`
 * for the rest. Prometheus shows them with dots as underscores.
 */
export function createMetrics(meter: Meter = getMeter()): Metrics {
  const requestDuration = meter.createHistogram("http.server.request.duration", {
    unit: "s",
    description:
      "Duration of the HTTP requests. An event stream counts until its headers are sent.",
    advice: { explicitBucketBoundaries: DURATION_BUCKETS },
  });
  const openStreams = meter.createUpDownCounter("harborfront.realtime.streams.open", {
    unit: "{stream}",
    description: "Open event streams.",
  });
  const reconnects = meter.createCounter("harborfront.realtime.reconnects", {
    unit: "{stream}",
    description: "Event streams that opened with a Last-Event-ID.",
  });
  const resumes = meter.createCounter("harborfront.realtime.resumes", {
    unit: "{stream}",
    description: "Reconnects by what they got: events, snapshot or none.",
  });
  const autosaves = meter.createCounter("harborfront.realtime.autosaves", {
    unit: "{game}",
    description: "Games saved by themselves after every controller went away.",
  });
  const devices = meter.createObservableGauge("harborfront.realtime.devices.connected", {
    unit: "{user}",
    description: "Signed-in users with at least one open event stream.",
  });

  // A user with two tabs has two streams and is one connected device.
  const streamsOf = new Map<string, number>();
  devices.addCallback((result) => result.observe(streamsOf.size));

  return {
    httpRequest({ method, route, status, seconds }) {
      requestDuration.record(seconds, {
        "http.request.method": method,
        "http.route": route,
        "http.response.status_code": status,
      });
    },
    streamOpened(userId, reconnect) {
      openStreams.add(1);
      if (reconnect) reconnects.add(1);
      streamsOf.set(userId, (streamsOf.get(userId) ?? 0) + 1);
    },
    streamClosed(userId) {
      openStreams.add(-1);
      const left = (streamsOf.get(userId) ?? 1) - 1;
      if (left <= 0) streamsOf.delete(userId);
      else streamsOf.set(userId, left);
    },
    resumed: (kind) => resumes.add(1, { kind }),
    autoSaved: () => autosaves.add(1),
    observePresence(tracker) {
      const presence = meter.createObservableGauge("harborfront.realtime.presence", {
        unit: "{user}",
        description: "Controllers of started games by presence state, counted for each game.",
      });
      presence.addCallback((result) => {
        const counts = tracker.counts();
        for (const state of Object.keys(counts) as PresenceStatus[]) {
          result.observe(counts[state], { state });
        }
      });
    },
  };
}

/** The histogram of the query durations, in seconds. Used by `createQueryObserver`. */
export function createQueryDuration(meter: Meter = getMeter()) {
  return meter.createHistogram("db.client.operation.duration", {
    unit: "s",
    description: "Duration of the database queries.",
    advice: { explicitBucketBoundaries: DURATION_BUCKETS },
  });
}

/**
 * The gauges of the process: the resident memory and the size of the database file. The event
 * loop delay, the garbage collection and the heap come from the runtime instrumentation in
 * `otel.ts`. A file that does not exist (`:memory:`, or not made yet) is not reported.
 */
export function registerProcessMetrics(meter: Meter, options: { dbPath: string }): void {
  meter
    .createObservableGauge("process.memory.usage", {
      unit: "By",
      description: "Resident set size of the process.",
    })
    .addCallback((result) => result.observe(process.memoryUsage.rss()));
  meter
    .createObservableGauge("harborfront.db.file.size", {
      unit: "By",
      description: "Size of the SQLite database file.",
    })
    .addCallback((result) => {
      try {
        result.observe(statSync(options.dbPath).size);
      } catch {
        // No file to measure.
      }
    });
}
