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

// jsdom does not implement `<dialog>` methods. `show` opens the dialog and `close` closes it and
// fires `close`. There is no top layer here.
if (!("show" in HTMLDialogElement.prototype)) {
  Object.defineProperties(HTMLDialogElement.prototype, {
    show: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        if (!this.hasAttribute("open")) return;
        this.removeAttribute("open");
        this.dispatchEvent(new Event("close"));
      },
    },
  });
}
