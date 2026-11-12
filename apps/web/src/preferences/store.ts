import { useSyncExternalStore } from "react";

/**
 * Device settings in `localStorage`: motion, sound, and later theme and language. Storage can be
 * blocked (private modes, strict privacy settings). A blocked read gives `null`, so the default
 * holds, and a blocked write keeps the change only until the page closes.
 */
export function readKey(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Writes `value` under `key`. `null` removes the key, so the default holds again. */
export function writeKey(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Not kept, but the caller keeps the value in memory.
  }
}

// Members are function properties, not methods: they use no `this`, so they can be passed on.
export interface PreferenceStore<T> {
  /** The value now. The same object comes back until it changes, as React needs. */
  get: () => T;
  /** Keeps `value` and tells the listeners. */
  set: (value: T) => void;
  /** Reads the value again and tells the listeners, for a change from outside (a device setting). */
  refresh: () => void;
  subscribe: (listener: () => void) => () => void;
  /** Keeps the value in step with other tabs. Returns the stop function. */
  start: () => () => void;
}

export interface PreferenceOptions<T> {
  /** The storage keys of this setting, so a change in another tab is found. */
  keys: readonly string[];
  /** Reads the value with `readKey`. Must give a valid value for any stored text. */
  read: () => T;
  /** Stores the value with `writeKey`. */
  write: (value: T) => void;
  /** Runs after each change, before the listeners, for example to set an attribute. */
  onChange?: (value: T) => void;
}

export function createPreference<T>({
  keys,
  read,
  write,
  onChange,
}: PreferenceOptions<T>): PreferenceStore<T> {
  const listeners = new Set<() => void>();
  let cached: { value: T } | null = null;

  const get = () => {
    cached ??= { value: read() };
    return cached.value;
  };
  const notify = () => {
    onChange?.(get());
    for (const listener of listeners) listener();
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return {
    get,
    set(value) {
      write(value);
      cached = { value };
      notify();
    },
    refresh() {
      cached = null;
      notify();
    },
    subscribe,
    start() {
      const onStorage = (event: StorageEvent) => {
        // `null` is a `localStorage.clear()` in another tab
        if (event.key === null || keys.includes(event.key)) {
          cached = null;
          notify();
        }
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    },
  };
}

/** The value of `store` in a React component. */
export function usePreference<T>(store: PreferenceStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get);
}
