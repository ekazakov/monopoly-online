import { useSyncExternalStore } from "react";

/**
 * The reduced motion setting. The user can follow the device (`system`) or choose in the game
 * Menu. A choice is kept on this device. Reduced motion switches off all animation and all
 * transitions, the dice roll, the token hops and the camera damping.
 */
export type MotionPreference = "system" | "reduce" | "full";

const STORAGE_KEY = "hf.motion";
const QUERY = "(prefers-reduced-motion: reduce)";

const listeners = new Set<() => void>();

function systemReduces(): boolean {
  return window.matchMedia?.(QUERY).matches ?? false;
}

export function readMotionPreference(): MotionPreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "reduce" || stored === "full" ? stored : "system";
  } catch {
    // Storage can be blocked. The device setting then decides.
    return "system";
  }
}

/** True when motion must be off, by the choice of the user or else by the device. */
export function isReducedMotion(): boolean {
  const preference = readMotionPreference();
  return preference === "system" ? systemReduces() : preference === "reduce";
}

/** The CSS reads `data-motion` on the root element, so one switch serves all the styles. */
function applyAttribute() {
  document.documentElement.dataset.motion = isReducedMotion() ? "reduce" : "full";
}

function notify() {
  applyAttribute();
  for (const listener of listeners) listener();
}

export function setMotionPreference(preference: MotionPreference) {
  try {
    if (preference === "system") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Not kept, but the change still holds until the page closes.
  }
  notify();
}

/**
 * Sets the switch of the Menu. A value equal to the device setting clears the choice, so the
 * game follows the device again.
 */
export function setReducedMotion(reduced: boolean) {
  setMotionPreference(reduced === systemReduces() ? "system" : reduced ? "reduce" : "full");
}

/** Sets `data-motion` at start and keeps it in step with the device and with other tabs. */
export function startMotionPreference(): () => void {
  applyAttribute();
  const query = window.matchMedia?.(QUERY);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY) notify();
  };
  query?.addEventListener("change", notify);
  window.addEventListener("storage", onStorage);
  return () => {
    query?.removeEventListener("change", notify);
    window.removeEventListener("storage", onStorage);
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether the game must show no animation now. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, isReducedMotion);
}
