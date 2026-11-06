// Hono's `StreamingApi.write` catches every write error, so a stream whose client has gone can look
// open for ever. The heartbeat uses this write instead: it reports the failure.
interface HasWriter {
  writer?: WritableStreamDefaultWriter<Uint8Array>;
}

/** The part of the Hono stream that this module needs. */
export interface CheckedStream {
  write(input: string): Promise<unknown>;
}

const encoder = new TextEncoder();

/**
 * Write `text` and say whether it worked. Uses the writer of the Hono stream (a private field in
 * the types, public in the code of the pinned version). When the field is not there, it falls back
 * to `stream.write`, which cannot fail, so the result is always true and nothing is lost.
 */
export async function writeChecked(stream: CheckedStream, text: string): Promise<boolean> {
  const writer = (stream as HasWriter).writer;
  if (!writer) {
    await stream.write(text);
    return true;
  }
  try {
    await writer.write(encoder.encode(text));
    return true;
  } catch {
    return false;
  }
}
