import { describe, expect, it } from "vite-plus/test";
import { createMemoryLogger } from "./log-test-helpers.ts";
import { createSilentLogger, readLogLevel, readLogPretty } from "./log.ts";

const memoryLogger = (level: "info" | "debug" = "info") => createMemoryLogger(level);

describe("readLogLevel", () => {
  it("defaults to info, and to debug in development", () => {
    expect(readLogLevel({})).toBe("info");
    expect(readLogLevel({ NODE_ENV: "production" })).toBe("info");
    expect(readLogLevel({ NODE_ENV: "development" })).toBe("debug");
  });

  it("lets LOG_LEVEL win", () => {
    expect(readLogLevel({ NODE_ENV: "development", LOG_LEVEL: "warn" })).toBe("warn");
    expect(readLogLevel({ LOG_LEVEL: "" })).toBe("info");
  });

  it("refuses an unknown level", () => {
    expect(() => readLogLevel({ LOG_LEVEL: "loud" })).toThrow(/LOG_LEVEL/);
  });
});

describe("readLogPretty", () => {
  it("is on in development and off elsewhere", () => {
    expect(readLogPretty({})).toBe(false);
    expect(readLogPretty({ NODE_ENV: "production" })).toBe(false);
    expect(readLogPretty({ NODE_ENV: "development" })).toBe(true);
  });

  it("lets LOG_PRETTY win, so a development container can keep JSON lines", () => {
    expect(readLogPretty({ NODE_ENV: "development", LOG_PRETTY: "false" })).toBe(false);
    expect(readLogPretty({ NODE_ENV: "production", LOG_PRETTY: "true" })).toBe(true);
    expect(readLogPretty({ NODE_ENV: "development", LOG_PRETTY: "" })).toBe(true);
  });

  it("refuses another value", () => {
    expect(() => readLogPretty({ LOG_PRETTY: "yes" })).toThrow(/LOG_PRETTY/);
  });
});

describe("createLogger", () => {
  it("writes JSON lines with a text level, an ISO time and the service name", () => {
    const { logger, lines } = memoryLogger();
    logger.info({ gameId: "g1" }, "hello");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: "info", service: "api", gameId: "g1", msg: "hello" });
    expect(new Date(lines[0]!.time as string).toISOString()).toBe(lines[0]!.time);
  });

  it("drops lines below the level", () => {
    const { logger, lines } = memoryLogger("info");
    logger.debug("hidden");
    logger.warn("shown");
    expect(lines.map((line) => line.msg)).toEqual(["shown"]);
  });

  it("redacts cookies, tokens, OAuth values and personal data", () => {
    const { logger, lines } = memoryLogger();
    logger.info(
      {
        req: {
          headers: { cookie: "harborfront_session=secret", "user-agent": "agent", accept: "*/*" },
        },
        res: { headers: { "set-cookie": "harborfront_session=secret" } },
        headers: { authorization: "Bearer secret" },
        sessionToken: "secret",
        session: { token: "secret" },
        oauth: { code: "secret", state: "secret" },
        query: { code: "secret", state: "secret" },
        user: { email: "a@example.com", name: "Ada" },
        ip: "10.0.0.1",
        errorCode: "not_found",
      },
      "request",
    );
    const text = JSON.stringify(lines[0]);
    expect(text).not.toContain("secret");
    expect(text).not.toContain("a@example.com");
    expect(text).not.toContain("10.0.0.1");
    expect(text).not.toContain('"agent"');
    // Fields that are allowed stay.
    expect(lines[0]).toMatchObject({
      req: { headers: { accept: "*/*" } },
      user: { name: "Ada" },
      errorCode: "not_found",
    });
  });

  it("keeps the fields of a child logger", () => {
    const { logger, lines } = memoryLogger();
    logger.child({ requestId: "r1" }).info("child");
    expect(lines[0]).toMatchObject({ requestId: "r1" });
  });
});

describe("createSilentLogger", () => {
  it("writes nothing at any level", () => {
    const logger = createSilentLogger();
    expect(logger.level).toBe("silent");
    expect(logger.isLevelEnabled("fatal")).toBe(false);
  });
});
