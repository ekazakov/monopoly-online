// Load this file before the app: `node --import ./src/telemetry.ts src/index.ts`. The SDK must be
// running before the modules it patches are loaded. Without `OTEL_EXPORTER_OTLP_ENDPOINT` it
// does nothing. A telemetry fault must not stop the API, so a failed start only writes a warning.
import { registerTelemetry, startTelemetry } from "./otel.ts";

try {
  const telemetry = await startTelemetry(process.env);
  if (telemetry) registerTelemetry(telemetry);
} catch (err) {
  console.error("telemetry failed to start, the API runs without it", err);
}
