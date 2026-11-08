import { context, propagation, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
  type ReadableSpan,
} from "@opentelemetry/sdk-trace";

/**
 * Registers a tracer provider that keeps the finished spans in memory, and the context manager that
 * carries the active span through `await`. Call `uninstall` in `afterEach`: the globals are
 * set once for each process.
 */
export function installTestTracing() {
  const exporter = new InMemorySpanExporter();
  const provider = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] });
  const contextManager = new AsyncLocalStorageContextManager().enable();
  context.setGlobalContextManager(contextManager);
  trace.setGlobalTracerProvider(provider);
  // NodeSDK sets this in the app. The header test needs it.
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  return {
    /** The finished spans so far, oldest first. */
    spans: (): ReadableSpan[] => exporter.getFinishedSpans(),
    named: (name: string) => exporter.getFinishedSpans().filter((span) => span.name === name),
    async uninstall() {
      await provider.shutdown();
      trace.disable();
      propagation.disable();
      context.disable();
      contextManager.disable();
    },
  };
}
