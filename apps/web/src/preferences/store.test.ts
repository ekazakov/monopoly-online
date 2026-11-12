import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { createPreference, readKey, writeKey } from "./store.ts";

type Size = "small" | "large";

const KEY = "hf.test.size";

function sizeStore(onChange?: (value: Size) => void) {
  return createPreference<Size>({
    keys: [KEY],
    read: () => (readKey(KEY) === "large" ? "large" : "small"),
    write: (value) => writeKey(KEY, value === "small" ? null : value),
    onChange,
  });
}

function blockStorage() {
  const fail = () => {
    throw new DOMException("blocked", "SecurityError");
  };
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(fail);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(fail);
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(fail);
}

describe("preference store", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  test("keeps a choice in storage and removes it for the default", () => {
    const store = sizeStore();
    store.set("large");
    expect(window.localStorage.getItem(KEY)).toBe("large");
    expect(sizeStore().get()).toBe("large");
    store.set("small");
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  test("a bad stored value gives the default", () => {
    window.localStorage.setItem(KEY, "huge");
    expect(sizeStore().get()).toBe("small");
  });

  test("blocked storage gives the default, and a change holds in memory", () => {
    blockStorage();
    const store = sizeStore();
    expect(store.get()).toBe("small");
    store.set("large");
    expect(store.get()).toBe("large");
  });

  test("gives the same value until it changes, and tells the listeners", () => {
    const changed = vi.fn<(value: Size) => void>();
    const listener = vi.fn<() => void>();
    const store = sizeStore(changed);
    const stop = store.subscribe(listener);
    expect(store.get()).toBe(store.get());
    store.set("large");
    expect(changed).toHaveBeenCalledWith("large");
    expect(listener).toHaveBeenCalledOnce();
    stop();
    store.set("small");
    expect(listener).toHaveBeenCalledOnce();
  });

  test("follows a change in another tab, and ignores other keys", () => {
    const store = sizeStore();
    const listener = vi.fn<() => void>();
    store.subscribe(listener);
    const stop = store.start();
    expect(store.get()).toBe("small");

    window.localStorage.setItem(KEY, "large");
    window.dispatchEvent(new StorageEvent("storage", { key: "hf.other" }));
    expect(listener).not.toHaveBeenCalled();
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    expect(store.get()).toBe("large");
    expect(listener).toHaveBeenCalledOnce();

    stop();
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
    expect(listener).toHaveBeenCalledOnce();
  });
});
