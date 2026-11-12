import { createPreference, readKey, usePreference, writeKey } from "../preferences/store.ts";

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

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function readVolume(key: string, fallback: number): number {
  const stored = readKey(key);
  if (stored === null) return fallback;
  const value = Number(stored);
  return Number.isFinite(value) ? clamp(value) : fallback;
}

// A blocked storage reads as nothing stored, so the defaults hold.
const sound = createPreference<SoundPreference>({
  keys: Object.values(KEYS),
  read: () => ({
    enabled: readKey(KEYS.enabled) !== "off",
    effects: readVolume(KEYS.effects, DEFAULT_SOUND.effects),
    music: readVolume(KEYS.music, DEFAULT_SOUND.music),
  }),
  write: (value) => {
    writeKey(KEYS.enabled, value.enabled ? null : "off");
    writeKey(KEYS.effects, String(value.effects));
    writeKey(KEYS.music, String(value.music));
  },
});

/** The settings now. The same object comes back until a setting changes, as React needs. */
export function readSoundPreference(): SoundPreference {
  return sound.get();
}

export function setSoundPreference(change: Partial<SoundPreference>) {
  const merged = { ...readSoundPreference(), ...change };
  sound.set({
    enabled: merged.enabled,
    effects: clamp(merged.effects),
    music: clamp(merged.music),
  });
}

export function subscribeSoundPreference(listener: () => void): () => void {
  return sound.subscribe(listener);
}

/** Keeps the settings in step with other tabs. */
export function startSoundPreference(): () => void {
  return sound.start();
}

export function useSoundPreference(): SoundPreference {
  return usePreference(sound);
}
