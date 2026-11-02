import { describe, expect, test } from "vite-plus/test";
import { safeRedirect } from "./redirect.ts";

describe("safeRedirect", () => {
  test.each([
    "/",
    "/games/7b0f7a3e",
    "/games/7b0f7a3e/play",
    "/games/7b0f7a3e?tab=log#top",
    "/a/b%20c",
  ])("keeps the same-site path %s", (value) => {
    expect(safeRedirect(value)).toBe(value);
  });

  test.each([
    ["a protocol-relative URL", "//evil.com"],
    ["a protocol-relative URL with a path", "//evil.com/x"],
    ["an absolute URL", "https://x"],
    ["an absolute http URL", "http://evil.com/"],
    ["a backslash after the slash", "/\\x"],
    ["a backslash in the path", "/a\\b"],
    ["a script URL", "javascript:alert(1)"],
    ["a relative path", "games/1"],
    ["an empty string", ""],
    ["a tab in the host part", "/\t/evil.com"],
    ["a newline", "/a\nb"],
    ["the sign-in screen", "/sign-in"],
    ["the sign-in screen with a query", "/sign-in?redirect=/x"],
  ])("refuses %s", (_name, value) => {
    expect(safeRedirect(value)).toBeUndefined();
  });

  test.each([undefined, null, 5, ["/"], {}])(
    "refuses a value that is not a string: %j",
    (value) => {
      expect(safeRedirect(value)).toBeUndefined();
    },
  );
});
