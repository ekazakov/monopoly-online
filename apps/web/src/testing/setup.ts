import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup } from "@testing-library/react";
import { afterEach, expect, vi } from "vite-plus/test";

expect.extend(matchers);

// Testing Library only cleans up on its own when the runner has globals.
afterEach(() => {
  cleanup();
});

// jsdom does not implement scrolling; the router calls it on navigation.
window.scrollTo = vi.fn();
