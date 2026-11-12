import { useSyncExternalStore } from "react";
import { createPreference, readKey, writeKey } from "../preferences/store.ts";

/**
 * The reduced motion setting. The user can follow the device (`system`) or choose in the game
 * Menu. A choice is kept on this device. Reduced motion switches off all animation and all
 * transitions, the dice roll, the token hops and the camera damping.
 */
export type MotionPreference = "system" | "reduce" | "full";

const STORAGE_KEY = "hf.motion";
const QUERY = "(prefers-reduced-motion: reduce)";

function systemReduces(): boolean {
  return window.matchMedia?.(QUERY).matches ?? false;
}

/** The CSS reads `data-motion` on the root element, so one switch serves all the styles. */
function applyAttribute() {
  document.documentElement.dataset.motion = isReducedMotion() ? "reduce" : "full";
}

const motion = createPreference<MotionPreference>({
  keys: [STORAGE_KEY],
  read: () => {
    const stored = readKey(STORAGE_KEY);
    // a blocked storage reads as nothing stored, so the device setting decides
    return stored === "reduce" || stored === "full" ? stored : "system";
  },
  write: (value) => writeKey(STORAGE_KEY, value === "system" ? null : value),
  onChange: applyAttribute,
});

export function readMotionPreference(): MotionPreference {
  return motion.get();
}

/** True when motion must be off, by the choice of the user or else by the device. */
export function isReducedMotion(): boolean {
  const preference = readMotionPreference();
  return preference === "system" ? systemReduces() : preference === "reduce";
}

export function setMotionPreference(preference: MotionPreference) {
  motion.set(preference);
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
  const onDevice = () => motion.refresh();
  query?.addEventListener("change", onDevice);
  const stopTabs = motion.start();
  return () => {
    query?.removeEventListener("change", onDevice);
    stopTabs();
  };
}

/** Whether the game must show no animation now. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(motion.subscribe, isReducedMotion);
}
