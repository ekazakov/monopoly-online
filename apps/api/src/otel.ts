// The OpenTelemetry SDK, started before the app code. `telemetry.ts` calls it with `node --import`.
// It stays apart from `telemetry.ts` so a test can call `startTelemetry` without the side effect.

export const DEFAULT_SERVICE_NAME = "harborfront-api";

export interface Telemetry {
  /** Export what is still waiting (spans, metrics, logs), then stop the SDK. */
  shutdown(): Promise<void>;
}

/** Telemetry is on only when an OTLP endpoint is set. Nothing is exported without one. */
export function telemetryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "").trim() !== "" && env.OTEL_SDK_DISABLED !== "true";
}

/**
 * Starts the Node SDK with the OTLP exporters for traces, metrics and logs. The standard `OTEL_*`
 * variables set the endpoint, the headers, the protocol, the service name and the sampler. The
 * default service name is `harborfront-api`. Returns `null` and loads nothing when telemetry is off.
 * The SDK is imported here and not at the top, so a start without telemetry does not pay for it.
 */
export async function startTelemetry(
  env: NodeJS.ProcessEnv = process.env,
): Promise<Telemetry | null> {
  if (!telemetryEnabled(env)) return null;
  const { NodeSDK } = await import("@opentelemetry/sdk-node");
  const sdk = new NodeSDK(env.OTEL_SERVICE_NAME ? {} : { serviceName: DEFAULT_SERVICE_NAME });
  sdk.start();
  return { shutdown: () => sdk.shutdown() };
}

// `index.ts` is bundled and `telemetry.ts` is loaded by `--import`, so they can hold two copies of
// this module. A global symbol gives both the same handle.
const KEY = Symbol.for("harborfront.telemetry");
type Holder = { [KEY]?: Telemetry };

export function registerTelemetry(telemetry: Telemetry): void {
  (globalThis as Holder)[KEY] = telemetry;
}

/** The running telemetry, or `undefined` when it is off. */
export function getTelemetry(): Telemetry | undefined {
  return (globalThis as Holder)[KEY];
}
