import { describe, expect, test } from "vite-plus/test";
import {
  apiErrorCodes,
  apiErrorSchema,
  engineErrorCodes,
  errorCodes,
  errorStatus,
} from "./index.ts";

describe("error codes", () => {
  test("errorCodes is the union of API and engine codes without duplicates", () => {
    expect(new Set(errorCodes).size).toBe(errorCodes.length);
    expect(errorCodes).toHaveLength(apiErrorCodes.length + engineErrorCodes.length);
    expect([...errorCodes].sort()).toEqual([...apiErrorCodes, ...engineErrorCodes].sort());
  });

  test("every code of the status table is known", () => {
    const table = {
      400: ["bad_request", "validation_error"],
      401: ["unauthorized"],
      403: ["forbidden_origin", "not_game_owner", "not_a_member", "not_your_seat"],
      404: ["not_found"],
      409: [
        "already_signed_in",
        "name_taken",
        "already_joined",
        "game_full",
        "game_not_waiting",
        "game_not_active",
        "game_not_finished",
        "not_enough_players",
        "seat_name_taken",
        "owner_cannot_leave",
        "cannot_remove_user_seat",
        "version_conflict",
      ],
      422: ["not_your_turn", "wrong_phase", "insufficient_funds"],
      500: ["internal_error"],
    } as const;
    for (const [status, codes] of Object.entries(table)) {
      for (const code of codes) {
        expect(errorCodes).toContain(code);
        expect(errorStatus(code)).toBe(Number(status));
      }
    }
  });

  test("every engine code maps to 422", () => {
    for (const code of engineErrorCodes) expect(errorStatus(code)).toBe(422);
  });
});

describe("apiErrorSchema", () => {
  test("accepts a plain error", () => {
    const body = { error: { code: "not_found", message: "Game not found" } };
    expect(apiErrorSchema.parse(body)).toEqual(body);
  });

  test("accepts issues and an engine code", () => {
    const body = {
      error: {
        code: "validation_error",
        message: "Invalid request",
        issues: [{ path: ["action", "square"], message: "Too big" }],
      },
    };
    expect(apiErrorSchema.parse(body)).toEqual(body);
    expect(
      apiErrorSchema.safeParse({ error: { code: "not_your_turn", message: "No" } }).success,
    ).toBe(true);
  });

  test("accepts currentVersion on a version conflict", () => {
    const body = { error: { code: "version_conflict", message: "Stale", currentVersion: 7 } };
    expect(apiErrorSchema.parse(body)).toEqual(body);
  });

  test("refuses an unknown code or a body without the error key", () => {
    expect(apiErrorSchema.safeParse({ error: { code: "boom", message: "x" } }).success).toBe(false);
    expect(apiErrorSchema.safeParse({ code: "not_found", message: "x" }).success).toBe(false);
    expect(apiErrorSchema.safeParse({ error: { code: "not_found" } }).success).toBe(false);
  });
});
