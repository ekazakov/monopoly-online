import { createPreference, readKey, usePreference, writeKey } from "../../../preferences/store.ts";

/**
 * The debug switch "End turn automatically", kept on this device. It is off by default, so a game
 * without the switch (and the browser tests) still waits for Next turn.
 */
const STORAGE_KEY = "hf.debug.autoEndTurn";

const autoEndTurn = createPreference<boolean>({
  keys: [STORAGE_KEY],
  read: () => readKey(STORAGE_KEY) === "true",
  write: (value) => writeKey(STORAGE_KEY, value ? "true" : null),
});

export function setAutoEndTurn(value: boolean): void {
  autoEndTurn.set(value);
}

/** Keeps the switch in step with other tabs. Returns the stop function. */
export function startAutoEndTurnPreference(): () => void {
  return autoEndTurn.start();
}

export function useAutoEndTurnPreference(): boolean {
  return usePreference(autoEndTurn);
}
