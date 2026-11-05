import { describe, expect, test } from "vite-plus/test";
import { ApiError } from "../../api.ts";
import { noticeFor } from "./notices.ts";
import { timeAgo } from "./time.ts";

describe("noticeFor", () => {
  const full = {
    title: "This game is full",
    text: "The last seat went while you were joining. Pick another game.",
  };

  test.each(["game_full", "game_not_waiting"] as const)("%s is the full notice", (code) => {
    for (const action of ["join", "accept"] as const) {
      expect(noticeFor(new ApiError(409, code, code), action)).toEqual(full);
    }
  });

  test("seat_name_taken names the problem", () => {
    expect(noticeFor(new ApiError(409, "seat_name_taken", "x"), "accept")).toEqual({
      title: "Your name is taken in this game",
      text: "A seat in this game has your name. Pick another game.",
    });
  });

  test("not_found says the game is gone", () => {
    expect(noticeFor(new ApiError(404, "not_found", "x"), "join").title).toBe("This game is gone");
  });

  test("anything else is a retry notice that names the action", () => {
    const error = new ApiError(500, "internal_error", "x");
    expect(noticeFor(error, "join")).toEqual({
      title: "Could not join the game",
      text: "Try again.",
    });
    expect(noticeFor(error, "accept").title).toBe("Could not accept the invite");
    expect(noticeFor(error, "decline").title).toBe("Could not decline the invite");
    expect(noticeFor(new TypeError("Failed to fetch"), "join").title).toBe(
      "Could not join the game",
    );
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-11-05T12:00:00.000Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();
  const MIN = 60_000;

  test.each([
    [0, "just now"],
    [59_000, "just now"],
    [MIN, "1 min ago"],
    [59 * MIN, "59 min ago"],
    [60 * MIN, "1 h ago"],
    [23 * 60 * MIN, "23 h ago"],
    [24 * 60 * MIN, "1 d ago"],
    [3 * 24 * 60 * MIN, "3 d ago"],
  ])("%i ms ago reads %j", (ms, text) => {
    expect(timeAgo(ago(ms), now)).toBe(text);
  });

  test("a time in the future, or a bad time, reads as just now", () => {
    expect(timeAgo(ago(-5 * MIN), now)).toBe("just now");
    expect(timeAgo("not a time", now)).toBe("just now");
  });
});
