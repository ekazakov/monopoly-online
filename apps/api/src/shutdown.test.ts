import { describe, expect, test } from "vite-plus/test";
import { createMemoryLogger } from "./log-test-helpers.ts";
import {
  DEFAULT_SHUTDOWN_TIMEOUT_MS,
  createShutdownHandle,
  readShutdownTimeout,
  runShutdown,
} from "./shutdown.ts";

describe("readShutdownTimeout", () => {
  test("defaults, reads a positive integer and refuses the rest", () => {
    expect(readShutdownTimeout({})).toBe(DEFAULT_SHUTDOWN_TIMEOUT_MS);
    expect(readShutdownTimeout({ SHUTDOWN_TIMEOUT_MS: "" })).toBe(DEFAULT_SHUTDOWN_TIMEOUT_MS);
    expect(readShutdownTimeout({ SHUTDOWN_TIMEOUT_MS: "2500" })).toBe(2500);
    for (const bad of ["0", "-1", "1.5", "soon"]) {
      expect(() => readShutdownTimeout({ SHUTDOWN_TIMEOUT_MS: bad })).toThrow(
        /SHUTDOWN_TIMEOUT_MS/,
      );
    }
  });
});

describe("createShutdownHandle", () => {
  test("begin aborts the signal, also when called twice", () => {
    const handle = createShutdownHandle();
    expect(handle.signal.aborted).toBe(false);
    handle.begin();
    handle.begin();
    expect(handle.signal.aborted).toBe(true);
  });
});

describe("runShutdown", () => {
  test("runs the steps in order and logs each one", async () => {
    const { logger, lines } = createMemoryLogger();
    const order: string[] = [];
    const outcome = await runShutdown({
      log: logger,
      reason: "SIGTERM",
      timeoutMs: 1000,
      steps: [
        { name: "one", run: () => void order.push("one") },
        {
          name: "two",
          run: async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            order.push("two");
          },
        },
      ],
    });
    expect(outcome).toBe("clean");
    expect(order).toEqual(["one", "two"]);
    expect(lines.map((line) => [line.msg, line.step ?? line.reason])).toEqual([
      ["shutdown started", "SIGTERM"],
      ["shutdown step done", "one"],
      ["shutdown step done", "two"],
      ["shutdown complete", undefined],
    ]);
    expect(lines.at(-1)).toMatchObject({ failed: false });
  });

  test("a failed step is logged and the next step still runs", async () => {
    const { logger, lines } = createMemoryLogger();
    let closed = false;
    const outcome = await runShutdown({
      log: logger,
      reason: "SIGINT",
      timeoutMs: 1000,
      steps: [
        {
          name: "flush",
          run: () => {
            throw new Error("flush failed");
          },
        },
        { name: "close database", run: () => void (closed = true) },
      ],
    });
    expect(outcome).toBe("failed");
    expect(closed).toBe(true);
    expect(lines.find((line) => line.msg === "shutdown step failed")).toMatchObject({
      level: "error",
      step: "flush",
      err: { message: "flush failed" },
    });
  });

  test("a step that does not end hits the time limit and is named in the log", async () => {
    const { logger, lines } = createMemoryLogger();
    const outcome = await runShutdown({
      log: logger,
      reason: "SIGTERM",
      timeoutMs: 20,
      steps: [
        { name: "wait for open requests", run: () => new Promise(() => {}) },
        { name: "close database", run: () => {} },
      ],
    });
    expect(outcome).toBe("timeout");
    expect(lines.at(-1)).toMatchObject({
      level: "error",
      msg: "shutdown timed out",
      step: "wait for open requests",
      timeoutMs: 20,
    });
  });
});
