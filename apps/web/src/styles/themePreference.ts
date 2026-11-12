import { useSyncExternalStore } from "react";
import { createPreference, readKey, writeKey } from "../preferences/store.ts";

/**
 * The colour theme. The user can follow the device (`system`) or choose light or dark in the game
 * Menu. A choice is kept on this device. Only the shell changes: the board, the street colours and
 * the pieces look the same on both themes (design system, Light theme board).
 */
export type ThemePreference = "system" | "light" | "dark";
export type Theme = "light" | "dark";

// `index.html` reads the same key before the first paint. Keep the two in step.
export const THEME_KEY = "hf.theme";
const QUERY = "(prefers-color-scheme: light)";

/** The browser bar colour of each theme: the `--hf-ground` token. */
export const THEME_COLOR: Record<Theme, string> = { dark: "#0e1822", light: "#dde5e2" };

function systemTheme(): Theme {
  return window.matchMedia?.(QUERY).matches ? "light" : "dark";
}

/** The CSS reads `data-theme` on the root element. */
function applyTheme() {
  const theme = currentTheme();
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
}

const store = createPreference<ThemePreference>({
  keys: [THEME_KEY],
  read: () => {
    const stored = readKey(THEME_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  },
  write: (value) => writeKey(THEME_KEY, value === "system" ? null : value),
  onChange: applyTheme,
});

export function readThemePreference(): ThemePreference {
  return store.get();
}

/** The theme that shows now, by the choice of the user or else by the device. */
export function currentTheme(): Theme {
  const preference = store.get();
  return preference === "system" ? systemTheme() : preference;
}

export function setThemePreference(preference: ThemePreference) {
  store.set(preference);
}

/** Sets `data-theme` at start and keeps it in step with the device and with other tabs. */
export function startThemePreference(): () => void {
  applyTheme();
  const query = window.matchMedia?.(QUERY);
  const onDevice = () => store.refresh();
  query?.addEventListener("change", onDevice);
  const stopTabs = store.start();
  return () => {
    query?.removeEventListener("change", onDevice);
    stopTabs();
  };
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(store.subscribe, store.get);
}

/** The theme that shows now, for code that cannot read CSS, such as the 3D board. */
export function useTheme(): Theme {
  return useSyncExternalStore(store.subscribe, currentTheme);
}
