import { describe, expect, test } from "vite-plus/test";
import { writeChecked } from "./checked-write.ts";

describe("writeChecked", () => {
  test("writes the text through the writer of the stream and says it worked", async () => {
    const chunks: Uint8Array[] = [];
    const stream = {
      writer: { write: async (chunk: Uint8Array) => void chunks.push(chunk) },
      write: async () => {
        throw new Error("The plain write must not be used");
      },
    };
    expect(await writeChecked(stream, ": heartbeat\n\n")).toBe(true);
    expect(new TextDecoder().decode(chunks[0])).toBe(": heartbeat\n\n");
  });

  test("says a failed write failed, which the Hono write would hide", async () => {
    const stream = {
      writer: {
        write: async () => {
          throw new TypeError("The stream is closed");
        },
      },
      write: async () => stream,
    };
    expect(await writeChecked(stream, ": heartbeat\n\n")).toBe(false);
  });

  test("falls back to the plain write when the stream has no writer", async () => {
    const written: string[] = [];
    const stream = { write: async (text: string) => void written.push(text) };
    expect(await writeChecked(stream, "hello")).toBe(true);
    expect(written).toEqual(["hello"]);
  });

  test("works with a real Hono stream", async () => {
    const { StreamingApi } = await import("hono/utils/stream");
    const { readable, writable } = new TransformStream();
    const api = new StreamingApi(writable, readable);
    expect(await writeChecked(api, ": ok\n\n")).toBe(true);
    // The reader is cancelled, so the next write fails. The Hono write would say nothing.
    await readable.cancel().catch(() => {});
    await api.responseReadable.cancel().catch(() => {});
    expect(await writeChecked(api, ": again\n\n")).toBe(false);
  });
});
