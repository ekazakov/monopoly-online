import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { metrics, trace } from "@opentelemetry/api";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import {
  DEFAULT_SERVICE_NAME,
  getTelemetry,
  registerTelemetry,
  startTelemetry,
  telemetryEnabled,
} from "./otel.ts";

describe("telemetryEnabled", () => {
  test("is on only when an OTLP endpoint is set", () => {
    expect(telemetryEnabled({})).toBe(false);
    expect(telemetryEnabled({ OTEL_EXPORTER_OTLP_ENDPOINT: "" })).toBe(false);
    expect(telemetryEnabled({ OTEL_EXPORTER_OTLP_ENDPOINT: "  " })).toBe(false);
    expect(telemetryEnabled({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318" })).toBe(true);
  });

  test("OTEL_SDK_DISABLED turns it off", () => {
    expect(
      telemetryEnabled({
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
        OTEL_SDK_DISABLED: "true",
      }),
    ).toBe(false);
  });
});

describe("startTelemetry", () => {
  let collector: Server;
  let received: { path: string; body: Buffer }[];

  beforeEach(async () => {
    received = [];
    collector = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        received.push({ path: req.url ?? "", body: Buffer.concat(chunks) });
        res.writeHead(200, { "content-type": "application/x-protobuf" }).end();
      });
    });
    await new Promise<void>((resolve) => collector.listen(0, "127.0.0.1", resolve));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await new Promise((resolve) => collector.close(resolve));
  });

  test("starts nothing without an endpoint", async () => {
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "");
    expect(await startTelemetry(process.env)).toBeNull();
  });

  test("exports traces and metrics to the endpoint on shutdown, with the default service name", async () => {
    const { port } = collector.address() as AddressInfo;
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", `http://127.0.0.1:${port}`);
    vi.stubEnv("OTEL_SERVICE_NAME", "");
    const telemetry = await startTelemetry(process.env);
    expect(telemetry).not.toBeNull();

    trace.getTracer("test").startSpan("test span").end();
    metrics.getMeter("test").createCounter("test.counter").add(1);
    await telemetry!.shutdown();

    const paths = received.map((request) => request.path);
    expect(paths).toContain("/v1/traces");
    expect(paths).toContain("/v1/metrics");
    const traces = received.find((request) => request.path === "/v1/traces")!;
    expect(traces.body.includes(DEFAULT_SERVICE_NAME)).toBe(true);
    expect(traces.body.includes("test span")).toBe(true);
  });
});

describe("registerTelemetry", () => {
  test("getTelemetry returns what was registered", () => {
    expect(getTelemetry()).toBeUndefined();
    const telemetry = { shutdown: async () => {} };
    registerTelemetry(telemetry);
    expect(getTelemetry()).toBe(telemetry);
  });
});
