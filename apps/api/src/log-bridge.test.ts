import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, test } from "vite-plus/test";

const run = promisify(execFile);

let collector: Server;
let received: { path: string; body: Buffer }[];

beforeEach(async () => {
  received = [];
  collector = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      received.push({ path: req.url ?? "", body: Buffer.concat(chunks) });
      res.writeHead(200).end();
    });
  });
  await new Promise<void>((resolve) => collector.listen(0, "127.0.0.1", resolve));
});

afterEach(async () => {
  await new Promise((resolve) => collector.close(resolve));
});

// pino is patched when it loads, so this needs a new process that starts with `telemetry.ts`.
test("log lines get the trace ids and go to the OTLP endpoint, redacted", async () => {
  const { port } = collector.address() as AddressInfo;
  const { stdout, stderr } = await run(
    process.execPath,
    ["--import", "./src/telemetry.ts", "./src/test-fixtures/log-bridge.ts"],
    {
      env: {
        ...process.env,
        OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${port}`,
        OTEL_SERVICE_NAME: "",
      },
    },
  );
  expect(stderr).not.toMatch(/deprecat/i);

  const lines = stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const outside = lines.find((line) => line.msg === "outside a span")!;
  const inside = lines.find((line) => line.msg === "inside a span")!;
  expect(outside.trace_id).toBeUndefined();
  expect(inside.trace_id).toMatch(/^[0-9a-f]{32}$/);
  expect(inside.span_id).toMatch(/^[0-9a-f]{16}$/);
  expect(inside.trace_flags).toBe("01");
  // The stdout line is redacted too.
  expect(JSON.stringify(inside)).not.toContain("SECRET-CODE");

  const logs = received.filter((request) => request.path === "/v1/logs");
  expect(logs.length).toBeGreaterThan(0);
  const body = Buffer.concat(logs.map((request) => request.body));
  expect(body.includes("inside a span")).toBe(true);
  expect(body.includes("visible-field")).toBe(true);
  expect(body.includes("SECRET-CODE")).toBe(false);
  // The exported record has the same trace id as the stdout line.
  expect(body.includes(Buffer.from(inside.trace_id as string, "hex"))).toBe(true);
});
