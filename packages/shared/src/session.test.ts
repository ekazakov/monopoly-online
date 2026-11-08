import { describe, expect, test } from "vite-plus/test";
import {
  authMethodsSchema,
  createSessionResponseSchema,
  createSessionSchema,
  displayNameSchema,
  googleNameRequestSchema,
  healthResponseSchema,
  notReadyResponseSchema,
  readyResponseSchema,
  userSchema,
} from "./index.ts";

const user = {
  id: "6f1c1a52-2c0e-4a49-9a1e-0a4f2d9d3b11",
  name: "Ann",
  createdAt: "2026-11-02T10:00:00.000Z",
};

describe("displayNameSchema", () => {
  test("trims the name", () => {
    expect(displayNameSchema.parse("  Ann  ")).toBe("Ann");
  });

  test("accepts 2 to 16 characters", () => {
    expect(displayNameSchema.safeParse("ab").success).toBe(true);
    expect(displayNameSchema.safeParse("a".repeat(16)).success).toBe(true);
  });

  test("refuses fewer than 2 or more than 16 characters after the trim", () => {
    expect(displayNameSchema.safeParse("a").success).toBe(false);
    expect(displayNameSchema.safeParse("  a  ").success).toBe(false);
    expect(displayNameSchema.safeParse("   ").success).toBe(false);
    expect(displayNameSchema.safeParse("a".repeat(17)).success).toBe(false);
    expect(displayNameSchema.safeParse(` ${"a".repeat(17)} `).success).toBe(false);
  });
});

describe("createSessionSchema", () => {
  test("parses a name", () => {
    expect(createSessionSchema.parse({ name: " Bo " })).toEqual({ name: "Bo" });
  });

  test("refuses unknown keys and a missing name", () => {
    expect(createSessionSchema.safeParse({ name: "Bo", admin: true }).success).toBe(false);
    expect(createSessionSchema.safeParse({}).success).toBe(false);
  });
});

describe("user responses", () => {
  test("userSchema needs a uuid and an ISO time", () => {
    expect(userSchema.parse(user)).toEqual(user);
    expect(userSchema.safeParse({ ...user, id: "1" }).success).toBe(false);
    expect(userSchema.safeParse({ ...user, createdAt: "yesterday" }).success).toBe(false);
    expect(userSchema.safeParse({ ...user, extra: 1 }).success).toBe(false);
  });

  test("the session response wraps the user", () => {
    expect(createSessionResponseSchema.parse({ user })).toEqual({ user });
    expect(createSessionResponseSchema.safeParse(user).success).toBe(false);
  });

  test("the health response is ok", () => {
    expect(healthResponseSchema.parse({ status: "ok" })).toEqual({ status: "ok" });
    expect(healthResponseSchema.safeParse({ status: "down" }).success).toBe(false);
  });

  test("the readiness bodies carry the checks and no error text", () => {
    const checks = { database: "ok", migrations: "pending" };
    expect(notReadyResponseSchema.parse({ status: "not_ready", checks })).toEqual({
      status: "not_ready",
      checks,
    });
    expect(readyResponseSchema.safeParse({ status: "not_ready", checks }).success).toBe(false);
    expect(
      readyResponseSchema.safeParse({ status: "ready", checks: { ...checks, error: "x" } }).success,
    ).toBe(false);
    expect(
      readyResponseSchema.safeParse({ status: "ready", checks: { database: "up" } }).success,
    ).toBe(false);
  });

  test("the sign-in methods have two flags and no more", () => {
    expect(authMethodsSchema.parse({ google: true, guest: false })).toEqual({
      google: true,
      guest: false,
    });
    expect(authMethodsSchema.safeParse({ google: true }).success).toBe(false);
    expect(authMethodsSchema.safeParse({ google: true, guest: 1 }).success).toBe(false);
    expect(authMethodsSchema.safeParse({ google: true, guest: true, x: 1 }).success).toBe(false);
  });

  test("the Google name step uses the display name rule", () => {
    expect(googleNameRequestSchema.parse({ name: "  Ines " })).toEqual({ name: "Ines" });
    expect(googleNameRequestSchema.safeParse({ name: "I" }).success).toBe(false);
    expect(googleNameRequestSchema.safeParse({ name: "Ines", email: "a@b.c" }).success).toBe(false);
  });
});
