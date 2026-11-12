import { useSyncExternalStore } from "react";
import { createPreference, readKey, writeKey } from "../preferences/store.ts";

/**
 * The language of the interface. The user can follow the device (`system`) or choose English or
 * Russian in the game Menu. A choice is kept on this device. Names that players type stay as typed.
 */
export type LanguagePreference = "system" | Language;
export type Language = "en" | "ru";

export const LANGUAGES: readonly Language[] = ["en", "ru"];

const STORAGE_KEY = "hf.lang";

/** The device language: any Russian tag in the browser list gives Russian, all else English. */
export function detectLanguage(tags: readonly string[] = navigator.languages ?? []): Language {
  return tags.some((tag) => tag.toLowerCase().split("-")[0] === "ru") ? "ru" : "en";
}

function isLanguage(value: string | null): value is Language {
  return (LANGUAGES as readonly (string | null)[]).includes(value);
}

/** Screen readers and the browser read `lang` on the root element. */
function applyLanguage() {
  document.documentElement.lang = currentLanguage();
}

const store = createPreference<LanguagePreference>({
  keys: [STORAGE_KEY],
  read: () => {
    const stored = readKey(STORAGE_KEY);
    return isLanguage(stored) ? stored : "system";
  },
  write: (value) => writeKey(STORAGE_KEY, value === "system" ? null : value),
  onChange: applyLanguage,
});

export function readLanguagePreference(): LanguagePreference {
  return store.get();
}

/** The language that shows now, by the choice of the user or else by the device. */
export function currentLanguage(): Language {
  const preference = store.get();
  return preference === "system" ? detectLanguage() : preference;
}

export function setLanguagePreference(preference: LanguagePreference) {
  store.set(preference);
}

/** Sets `lang` at start and keeps it in step with the device and with other tabs. */
export function startLanguagePreference(): () => void {
  applyLanguage();
  const onDevice = () => store.refresh();
  window.addEventListener("languagechange", onDevice);
  const stopTabs = store.start();
  return () => {
    window.removeEventListener("languagechange", onDevice);
    stopTabs();
  };
}

export function useLanguagePreference(): LanguagePreference {
  return useSyncExternalStore(store.subscribe, store.get);
}

/** The language that shows now, in a React component. */
export function useLanguage(): Language {
  return useSyncExternalStore(store.subscribe, currentLanguage);
}
