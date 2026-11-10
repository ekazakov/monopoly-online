import { describe, expect, test } from "vite-plus/test";
import { readAuthConfig, readDebugMode } from "./config.ts";

describe("readDebugMode", () => {
  test("is off when the variable is unset or empty", () => {
    expect(readDebugMode({})).toBe(false);
    expect(readDebugMode({ DEBUG_MODE_ENABLED: "" })).toBe(false);
    expect(readDebugMode({ DEBUG_MODE_ENABLED: "false" })).toBe(false);
  });

  test("is on when the variable is true, also in development", () => {
    expect(readDebugMode({ DEBUG_MODE_ENABLED: "true" })).toBe(true);
    expect(readDebugMode({ DEBUG_MODE_ENABLED: "true", NODE_ENV: "development" })).toBe(true);
  });

  test("refuses any other value", () => {
    for (const bad of ["1", "yes", "TRUE", " true"]) {
      expect(() => readDebugMode({ DEBUG_MODE_ENABLED: bad })).toThrow(
        "DEBUG_MODE_ENABLED must be",
      );
    }
  });

  test("refuses to start with debug mode on in production", () => {
    expect(() => readDebugMode({ DEBUG_MODE_ENABLED: "true", NODE_ENV: "production" })).toThrow(
      "not allowed when NODE_ENV is production",
    );
  });
});

const google = {
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "secret",
  GOOGLE_REDIRECT_URI: "http://localhost:5173/api/auth/google/callback",
};

describe("readAuthConfig", () => {
  test("guest only in development", () => {
    expect(readAuthConfig({ GUEST_SIGN_IN_ENABLED: "true" })).toEqual({ guest: true });
  });

  test("Google only", () => {
    expect(readAuthConfig({ ...google })).toEqual({
      guest: false,
      google: {
        clientId: "id",
        clientSecret: "secret",
        redirectUri: "http://localhost:5173/api/auth/google/callback",
      },
    });
  });

  test("both methods outside production", () => {
    const config = readAuthConfig({ ...google, GUEST_SIGN_IN_ENABLED: "true" });
    expect(config.guest).toBe(true);
    expect(config.google?.clientId).toBe("id");
  });

  test("production with Google values is allowed", () => {
    expect(readAuthConfig({ ...google, NODE_ENV: "production" }).guest).toBe(false);
  });

  test("guest sign-in in production does not start", () => {
    expect(() =>
      readAuthConfig({ ...google, GUEST_SIGN_IN_ENABLED: "true", NODE_ENV: "production" }),
    ).toThrow(/not allowed when NODE_ENV is production/);
  });

  test("production without Google values does not start", () => {
    expect(() => readAuthConfig({ NODE_ENV: "production" })).toThrow(/Production needs Google/);
  });

  test("no method does not start", () => {
    expect(() => readAuthConfig({})).toThrow(/No sign-in method/);
    expect(() => readAuthConfig({ GUEST_SIGN_IN_ENABLED: "false" })).toThrow(/No sign-in method/);
  });

  test("a part of the Google values does not start", () => {
    expect(() => readAuthConfig({ GOOGLE_CLIENT_ID: "id", GUEST_SIGN_IN_ENABLED: "true" })).toThrow(
      /Missing: GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI/,
    );
  });

  test("an unknown guest value does not start", () => {
    expect(() => readAuthConfig({ ...google, GUEST_SIGN_IN_ENABLED: "1" })).toThrow(
      /must be "true" or "false"/,
    );
  });

  test("empty values count as not set", () => {
    expect(
      readAuthConfig({
        GUEST_SIGN_IN_ENABLED: "true",
        GOOGLE_CLIENT_ID: "",
        GOOGLE_CLIENT_SECRET: "",
        GOOGLE_REDIRECT_URI: "",
      }),
    ).toEqual({ guest: true });
  });
});
