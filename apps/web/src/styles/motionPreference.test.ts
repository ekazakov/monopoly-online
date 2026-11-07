import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import {
  isReducedMotion,
  readMotionPreference,
  setMotionPreference,
  setReducedMotion,
} from "./motionPreference.ts";

function deviceReduces(reduces: boolean) {
  vi.stubGlobal("matchMedia", () => ({
    matches: reduces,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe("motion preference", () => {
  afterEach(() => {
    setMotionPreference("system");
    vi.unstubAllGlobals();
  });

  test("follows the device when nothing is chosen", () => {
    deviceReduces(true);
    expect(isReducedMotion()).toBe(true);
    deviceReduces(false);
    expect(isReducedMotion()).toBe(false);
  });

  test("a choice beats the device and is kept", () => {
    deviceReduces(false);
    setReducedMotion(true);
    expect(isReducedMotion()).toBe(true);
    expect(readMotionPreference()).toBe("reduce");
    deviceReduces(true);
    setReducedMotion(false);
    expect(isReducedMotion()).toBe(false);
    expect(readMotionPreference()).toBe("full");
  });

  test("a choice equal to the device setting clears the choice", () => {
    deviceReduces(true);
    setReducedMotion(false);
    setReducedMotion(true);
    expect(readMotionPreference()).toBe("system");
  });

  test("sets data-motion on the root element", () => {
    deviceReduces(false);
    setMotionPreference("reduce");
    expect(document.documentElement.dataset.motion).toBe("reduce");
    setMotionPreference("full");
    expect(document.documentElement.dataset.motion).toBe("full");
  });
});
