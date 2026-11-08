import type { Meter } from "@opentelemetry/api";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";

export type Point = {
  attributes: Record<string, unknown>;
  /** A number for a counter or a gauge, `{ count, sum, buckets }` for a histogram. */
  value: unknown;
};

/**
 * A meter whose values the test reads with `collect`. A reader that exports on a timer is the
 * smallest in-memory reader; the timer is so long that only `collect` triggers an export.
 */
export function createTestMeter() {
  const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  const reader = new PeriodicExportingMetricReader({
    exporter,
    exportIntervalMillis: 3_600_000,
  });
  const provider = new MeterProvider({ readers: [reader] });
  const meter: Meter = provider.getMeter("test");
  return {
    meter,
    /** The current data points of each metric, keyed by metric name. */
    async collect(): Promise<Record<string, Point[]>> {
      exporter.reset();
      await reader.forceFlush();
      const result: Record<string, Point[]> = {};
      for (const resource of exporter.getMetrics()) {
        for (const scope of resource.scopeMetrics) {
          for (const metric of scope.metrics) {
            result[metric.descriptor.name] = metric.dataPoints.map((point) => ({
              attributes: point.attributes as Record<string, unknown>,
              value: point.value,
            }));
          }
        }
      }
      return result;
    },
    shutdown: () => provider.shutdown(),
  };
}

/** The value of the data point whose attributes contain `attributes`. */
export function pointValue(points: Point[] | undefined, attributes: Record<string, unknown> = {}) {
  return points?.find((point) =>
    Object.entries(attributes).every(([key, value]) => point.attributes[key] === value),
  )?.value;
}
