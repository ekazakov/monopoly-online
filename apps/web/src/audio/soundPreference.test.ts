import { afterEach, describe, expect, test } from "vite-plus/test";
import {
  DEFAULT_SOUND,
  readSoundPreference,
  setSoundPreference,
  startSoundPreference,
  subscribeSoundPreference,
} from "./soundPreference.ts";

describe("sound preference", () => {
  afterEach(() => {
    window.localStorage.clear();
    setSoundPreference(DEFAULT_SOUND);
    window.localStorage.clear();
  });

  test("sound is on with music off by default", () => {
    expect(readSoundPreference()).toEqual({ enabled: true, effects: 0.7, music: 0 });
  });

  test("a change is kept on this device, clamped, and tells the listeners", () => {
    let calls = 0;
    const stop = subscribeSoundPreference(() => (calls += 1));
    setSoundPreference({ enabled: false, music: 1.5 });
    stop();
    expect(calls).toBe(1);
    expect(readSoundPreference()).toEqual({ enabled: false, effects: 0.7, music: 1 });
    expect(window.localStorage.getItem("hf.sound")).toBe("off");
    expect(window.localStorage.getItem("hf.sound.music")).toBe("1");
  });

  test("the same object comes back until a setting changes", () => {
    expect(readSoundPreference()).toBe(readSoundPreference());
  });

  test("a change in another tab is read again", () => {
    const stop = startSoundPreference();
    readSoundPreference();
    window.localStorage.setItem("hf.sound.effects", "0.25");
    window.dispatchEvent(new StorageEvent("storage", { key: "hf.sound.effects" }));
    stop();
    expect(readSoundPreference().effects).toBe(0.25);
  });
});
