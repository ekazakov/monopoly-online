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
  // The loader hook lets the instrumentation patch modules that the app imports with `import`.
  // It must be registered before the app code is loaded. Only `pino` is patched. The hook that
  // runs in the same thread needs a recent Node; an older Node gets the hook thread of
  // `module.register`, which Node 26 reports as deprecated.
  const { register, supportsSyncHooks } = await import("import-in-the-middle/register-hooks.mjs");
  if (supportsSyncHooks()) {
    register({ include: ["pino"] });
  } else {
    const { register: registerThread } = await import("node:module");
    registerThread("@opentelemetry/instrumentation/hook.mjs", import.meta.url);
  }
  const { NodeSDK } = await import("@opentelemetry/sdk-node");
  const { PinoInstrumentation } = await import("@opentelemetry/instrumentation-pino");
  const sdk = new NodeSDK({
    ...(env.OTEL_SERVICE_NAME ? {} : { serviceName: DEFAULT_SERVICE_NAME }),
    // Adds `trace_id`, `span_id` and `trace_flags` to each pino line, and sends the line to the
    // OTLP log exporter. It patches `pino` when the module loads, so this runs before the app.
    instrumentations: [new PinoInstrumentation()],
  });
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
