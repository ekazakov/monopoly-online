import { useSyncExternalStore } from "react";

/**
 * The sound settings of this device. `enabled` is the main switch. `effects` and `music` are the
 * volumes of the two buses, from 0 to 1. Music is off (0) until the user turns it up in the Menu.
 */
export interface SoundPreference {
  enabled: boolean;
  effects: number;
  music: number;
}

export const DEFAULT_SOUND: SoundPreference = { enabled: true, effects: 0.7, music: 0 };

const KEYS = { enabled: "hf.sound", effects: "hf.sound.effects", music: "hf.sound.music" } as const;

const listeners = new Set<() => void>();
let cached: SoundPreference | null = null;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function readVolume(key: string, fallback: number): number {
  const stored = window.localStorage.getItem(key);
  if (stored === null) return fallback;
  const value = Number(stored);
  return Number.isFinite(value) ? clamp(value) : fallback;
}

function read(): SoundPreference {
  try {
    return {
      enabled: window.localStorage.getItem(KEYS.enabled) !== "off",
      effects: readVolume(KEYS.effects, DEFAULT_SOUND.effects),
      music: readVolume(KEYS.music, DEFAULT_SOUND.music),
    };
  } catch {
    // Storage can be blocked. The defaults then hold.
    return DEFAULT_SOUND;
  }
}

/** The settings now. The same object comes back until a setting changes, as React needs. */
export function readSoundPreference(): SoundPreference {
  cached ??= read();
  return cached;
}

function notify() {
  cached = null;
  for (const listener of listeners) listener();
}

export function setSoundPreference(change: Partial<SoundPreference>) {
  const merged = { ...readSoundPreference(), ...change };
  const next = {
    enabled: merged.enabled,
    effects: clamp(merged.effects),
    music: clamp(merged.music),
  };
  try {
    if (next.enabled) window.localStorage.removeItem(KEYS.enabled);
    else window.localStorage.setItem(KEYS.enabled, "off");
    window.localStorage.setItem(KEYS.effects, String(next.effects));
    window.localStorage.setItem(KEYS.music, String(next.music));
  } catch {
    // Not kept, but the change still holds until the page closes.
  }
  cached = next;
  for (const listener of listeners) listener();
}

export function subscribeSoundPreference(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Keeps the settings in step with other tabs. */
export function startSoundPreference(): () => void {
  const keys: readonly string[] = Object.values(KEYS);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || keys.includes(event.key)) notify();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

export function useSoundPreference(): SoundPreference {
  return useSyncExternalStore(subscribeSoundPreference, readSoundPreference);
}
