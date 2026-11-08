// Run by `log-bridge.test.ts` in a child process, with `--import ./src/telemetry.ts`.
// pino is patched when it loads, so the check needs a process that starts with the SDK.
import { trace } from "@opentelemetry/api";
import { createLogger } from "../log.ts";
import { getTelemetry } from "../otel.ts";

const log = createLogger({ level: "info", pretty: false });
log.info("outside a span");
await trace.getTracer("fixture").startActiveSpan("work", async (span) => {
  log.info({ oauth: { code: "SECRET-CODE" }, shown: "visible-field" }, "inside a span");
  span.end();
});
await getTelemetry()?.shutdown();
