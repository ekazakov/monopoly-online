import { pino, type DestinationStream, type Logger } from "pino";

export type { Logger } from "pino";

export const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * Fields that must never reach a log line. Pino replaces the value with `[Redacted]`.
 * Field names for new log calls:
 * - Put OAuth `code` and `state` only under `oauth` or `query`, so they match these paths.
 *   Name an error code `errorCode`.
 * - Do not log a request or response object as a whole. Log the fields that you need.
 */
export const REDACT_PATHS = [
  // Session cookie, session token and Google tokens.
  "req.headers.cookie",
  "req.headers.authorization",
  'res.headers["set-cookie"]',
  "headers.cookie",
  "headers.authorization",
  'headers["set-cookie"]',
  "cookie",
  "authorization",
  "token",
  "sessionToken",
  "accessToken",
  "idToken",
  "*.token",
  "*.sessionToken",
  "*.accessToken",
  "*.idToken",
  "oauth.code",
  "oauth.state",
  "oauth.codeVerifier",
  "query.code",
  "query.state",
  // Personal data. The display name is permitted.
  "email",
  "*.email",
  "ip",
  "*.ip",
  "userAgent",
  "*.userAgent",
  'req.headers["user-agent"]',
  'req.headers["x-forwarded-for"]',
];

export type LoggerOptions = {
  /** Defaults to `LOG_LEVEL`, then `debug` in development, then `info`. */
  level?: LogLevel;
  /** Human-readable output through `pino-pretty`. Defaults to `true` when `NODE_ENV` is `development`. */
  pretty?: boolean;
  /** Where the JSON lines go. Defaults to stdout. Tests pass a stream to read the lines. Not used with `pretty`. */
  destination?: DestinationStream;
};

/** The level from the environment. A wrong `LOG_LEVEL` stops the start, as the other settings do. */
export function readLogLevel(env: NodeJS.ProcessEnv = process.env): LogLevel {
  const value = env.LOG_LEVEL;
  if (value === undefined || value === "") {
    return env.NODE_ENV === "development" ? "debug" : "info";
  }
  if (!(LOG_LEVELS as readonly string[]).includes(value)) {
    throw new Error(`LOG_LEVEL must be one of ${LOG_LEVELS.join(", ")}, got "${value}"`);
  }
  return value as LogLevel;
}

/**
 * The API logger. It writes JSON lines with a text `level`, an ISO `time` and the `service` name,
 * and it removes the fields in `REDACT_PATHS`. Make one in `index.ts` and pass it to `createApp`.
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? readLogLevel();
  const pretty = options.pretty ?? process.env.NODE_ENV === "development";
  return pino(
    {
      level,
      base: { service: "api" },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
      redact: { paths: REDACT_PATHS },
      ...(pretty
        ? { transport: { target: "pino-pretty", options: { colorize: true, ignore: "service" } } }
        : {}),
    },
    pretty ? undefined : options.destination,
  );
}

/** A logger that writes nothing. It is the default of `createApp`, so the tests stay quiet. */
export function createSilentLogger(): Logger {
  return pino({ level: "silent" });
}
