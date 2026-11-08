import type { Logger } from "./log.ts";

/** The time limit of a shutdown. It must be shorter than the stop timeout of the container (10 s). */
export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 8_000;

/** `SHUTDOWN_TIMEOUT_MS`. A wrong value stops the start, as the other settings do. */
export function readShutdownTimeout(env: NodeJS.ProcessEnv = process.env): number {
  const value = env.SHUTDOWN_TIMEOUT_MS;
  if (value === undefined || value === "") return DEFAULT_SHUTDOWN_TIMEOUT_MS;
  const ms = Number(value);
  if (!Number.isInteger(ms) || ms <= 0) {
    throw new Error(`SHUTDOWN_TIMEOUT_MS must be a positive integer, got "${value}"`);
  }
  return ms;
}

/**
 * What `createApp` shares with the shutdown. The app listens to `signal` to close its event
 * streams, and adds a function to `drains` for work that must finish before the database closes.
 */
export interface ShutdownHandle {
  /** Aborted when the shutdown begins. */
  readonly signal: AbortSignal;
  /** Each function resolves when the work of one part of the app is finished. */
  readonly drains: Array<() => Promise<unknown>>;
  /** Abort `signal`. Safe to call more than once. */
  begin(): void;
}

export function createShutdownHandle(): ShutdownHandle {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    drains: [],
    begin: () => controller.abort(),
  };
}

export type ShutdownStep = { name: string; run: () => unknown };

export type ShutdownOutcome = "clean" | "failed" | "timeout";

/**
 * Runs the steps in order and logs each one. A failed step is logged and the next step still
 * runs, so a late error does not keep the database open. When the steps need more than
 * `timeoutMs`, it logs the step that was running and returns `"timeout"` while that step
 * is still pending: the caller decides how to force the exit.
 * It does not call `process.exit` and does not read signals, so a test can run it.
 */
export async function runShutdown(options: {
  log: Logger;
  reason: string;
  steps: ShutdownStep[];
  timeoutMs: number;
}): Promise<ShutdownOutcome> {
  const { log, reason, steps, timeoutMs } = options;
  const started = performance.now();
  log.info({ reason, timeoutMs }, "shutdown started");

  let failed = false;
  let current = "";
  const work = (async () => {
    for (const step of steps) {
      current = step.name;
      const stepStarted = performance.now();
      try {
        await step.run();
        log.info(
          { step: step.name, durationMs: Math.round(performance.now() - stepStarted) },
          "shutdown step done",
        );
      } catch (err) {
        failed = true;
        log.error({ err, step: step.name }, "shutdown step failed");
      }
    }
    return "finished" as const;
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  const result = await Promise.race([work, limit]);
  clearTimeout(timer);

  const durationMs = Math.round(performance.now() - started);
  if (result === "timeout") {
    log.error({ step: current, timeoutMs, durationMs }, "shutdown timed out");
    return "timeout";
  }
  log.info({ durationMs, failed }, "shutdown complete");
  return failed ? "failed" : "clean";
}
