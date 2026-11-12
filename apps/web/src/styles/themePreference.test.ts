import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import {
  THEME_COLOR,
  currentTheme,
  readThemePreference,
  setThemePreference,
  startThemePreference,
} from "./themePreference.ts";

function deviceLight(light: boolean) {
  vi.stubGlobal("matchMedia", () => ({
    matches: light,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe("theme preference", () => {
  test("the browser bar colours equal the --hf-ground token of each theme", () => {
    const css = readFileSync(join(import.meta.dirname, "tokens.css"), "utf8");
    const grounds = [...css.matchAll(/--hf-ground:\s*(#[0-9a-f]{6})/g)].map((m) => m[1]);
    expect(grounds).toEqual([THEME_COLOR.dark, THEME_COLOR.light]);
    // index.html sets the light colour before the app starts
    const html = readFileSync(join(import.meta.dirname, "../../index.html"), "utf8");
    expect(html).toContain(THEME_COLOR.dark);
    expect(html).toContain(THEME_COLOR.light);
    expect(html).toContain('"hf.theme"');
  });

  afterEach(() => {
    setThemePreference("system");
    vi.unstubAllGlobals();
    document.head.innerHTML = "";
  });

  test("follows the device when nothing is chosen", () => {
    deviceLight(true);
    expect(currentTheme()).toBe("light");
    deviceLight(false);
    expect(currentTheme()).toBe("dark");
  });

  test("a stored choice beats the device and is kept", () => {
    deviceLight(true);
    setThemePreference("dark");
    expect(currentTheme()).toBe("dark");
    expect(window.localStorage.getItem("hf.theme")).toBe("dark");
    setThemePreference("system");
    expect(window.localStorage.getItem("hf.theme")).toBeNull();
    expect(readThemePreference()).toBe("system");
  });

  test("sets data-theme and the browser bar colour", () => {
    deviceLight(false);
    document.head.innerHTML = '<meta name="theme-color" content="" />';
    startThemePreference()();
    expect(document.documentElement.dataset.theme).toBe("dark");
    setThemePreference("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(
      THEME_COLOR.light,
    );
  });
});
