import { Writable } from "node:stream";
import { createLogger, type Logger, type LogLevel } from "./log.ts";

export type LogLine = Record<string, unknown> & { level: string; msg: string };

/** A logger that keeps its lines in memory, as parsed objects. */
export function createMemoryLogger(level: LogLevel = "debug"): {
  logger: Logger;
  lines: LogLine[];
} {
  const lines: LogLine[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(JSON.parse(chunk.toString()) as LogLine);
      done();
    },
  });
  return { logger: createLogger({ level, pretty: false, destination }), lines };
}
