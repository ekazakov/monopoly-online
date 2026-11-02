import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { GameStoreProvider } from "../../../game/GameStoreProvider.tsx";
import { actionsMessage, recordFixture, redact, snapshotMessage } from "../../../game/fixtures.ts";
import { createGameStore, initialGameState } from "../../../game/store.ts";
import { GameLayout } from "../GameLayout.tsx";
import { GameLog } from "./GameLog.tsx";

const fx = recordFixture(12);
const start = snapshotMessage(fx.game, redact(fx.start));

function setup(userId = fx.ownerId, steps = 0) {
  const store = createGameStore();
  store.applyStreamMessage(start);
  for (const step of fx.steps.slice(0, steps))
    store.applyStreamMessage(actionsMessage(fx.game, step));
  const view = render(
    <GameStoreProvider store={store}>
      <GameLog userId={userId} />
    </GameStoreProvider>,
  );
  const push = (index: number) =>
    act(() => store.applyStreamMessage(actionsMessage(fx.game, fx.steps[index]!)));
  return { store, push, ...view };
}

const log = () => screen.getByRole("log", { name: "Game log" });
const toggle = () => screen.getByRole("button", { name: /game log$/ });
const lines = () => Array.from(log().querySelectorAll<HTMLElement>(".game-log__line"));

describe("GameLog", () => {
  test("is a polite log with one root element", () => {
    const { container } = setup();
    expect(container.children).toHaveLength(1);
    expect(log()).toHaveAttribute("aria-live", "polite");
  });

  test("says so when there is nothing yet", () => {
    setup();
    expect(log()).toHaveTextContent("No events yet.");
  });

  test("tells that older entries were cut", () => {
    const store = createGameStore({ ...initialGameState, droppedEvents: 5 });
    render(
      <GameStoreProvider store={store}>
        <GameLog userId={fx.ownerId} />
      </GameStoreProvider>,
    );
    expect(log()).toHaveTextContent("Earlier entries are not shown.");
  });

  test("renders every event as a line with player names", () => {
    setup(fx.ownerId, 3);
    const events = fx.steps.slice(0, 3).flatMap((step) => step.events);
    expect(lines()).toHaveLength(events.length);
    expect(log().textContent).toMatch(/(Ann|Bo|Cy) rolled \d and \d/);
    expect(log().querySelector("b.game-log__name")).not.toBeNull();
  });

  test("lines are in time order, so the newest is last", () => {
    setup(fx.ownerId, 3);
    const texts = lines().map((line) => line.textContent);
    expect(texts[0]).toMatch(/rolled/);
    expect(texts.at(-1)).toMatch(/\.$|!$/);
  });

  test("marks the lines of the signed-in user's seats", () => {
    setup(fx.guestId, 6);
    const byName = (pattern: RegExp) =>
      lines().filter((line) => pattern.test(line.textContent ?? ""));
    const guestLines = byName(/^Bo /);
    const ownerLines = byName(/^(Ann|Cy) /);
    expect(guestLines.length).toBeGreaterThan(0);
    expect(ownerLines.length).toBeGreaterThan(0);
    expect(guestLines.every((line) => line.dataset.mine === "true")).toBe(true);
    expect(ownerLines.every((line) => line.dataset.mine === "false")).toBe(true);
  });

  test("a new game.actions message adds lines at the end", () => {
    const { push } = setup(fx.ownerId, 1);
    const before = lines().length;
    push(1);
    const after = lines();
    expect(after.length).toBe(before + fx.steps[1]!.events.length);
    expect(after[before]).toHaveAttribute("data-fresh", "true");
    expect(after[0]).toHaveAttribute("data-fresh", "false");
  });

  test("an old message does not add lines twice", () => {
    const { push } = setup(fx.ownerId, 2);
    const before = lines().length;
    push(1);
    expect(lines()).toHaveLength(before);
  });
});

describe("GameLog toggle", () => {
  test("is closed at first, with a labelled button", () => {
    setup(fx.ownerId, 2);
    expect(toggle()).toHaveAccessibleName("Expand game log");
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(toggle()).toHaveAttribute("aria-controls", log().id);
    expect(log()).toHaveAttribute("tabindex", "-1");
    expect(log().closest(".game-log")).toHaveAttribute("data-open", "false");
  });

  test("a click opens and closes the log", async () => {
    setup(fx.ownerId, 2);
    const user = userEvent.setup();
    await user.click(toggle());
    expect(toggle()).toHaveAccessibleName("Collapse game log");
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(log()).toHaveAttribute("tabindex", "0");
    await user.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  test("Enter and Space on the focused button toggle it", async () => {
    setup(fx.ownerId, 2);
    const user = userEvent.setup();
    await user.tab();
    expect(toggle()).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    await user.keyboard(" ");
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  test("the closed log is not a tab stop but the button is first", async () => {
    setup(fx.ownerId, 2);
    const user = userEvent.setup();
    await user.tab();
    expect(toggle()).toHaveFocus();
    await user.tab();
    expect(document.body).toHaveFocus();
  });

  test("Escape in the open log closes it and returns focus to the button", async () => {
    setup(fx.ownerId, 2);
    const user = userEvent.setup();
    await user.click(toggle());
    log().focus();
    await user.keyboard("{Escape}");
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(toggle()).toHaveFocus();
  });

  test("keeps every line in the closed log, for screen readers", () => {
    setup(fx.ownerId, 3);
    expect(lines().length).toBeGreaterThan(3);
  });

  test("fits the layout slot: the log has its own name inside the log bar", () => {
    const store = createGameStore();
    store.applyStreamMessage(start);
    render(
      <GameStoreProvider store={store}>
        <GameLayout log={<GameLog userId={fx.ownerId} />} />
      </GameStoreProvider>,
    );
    const bar = screen.getByRole("region", { name: "Game log bar" });
    expect(within(bar).getByRole("log", { name: "Game log" })).toBeInTheDocument();
  });
});

describe("GameLog auto-scroll", () => {
  // jsdom has no layout, so the scroll metrics are stubbed on the prototype.
  const metrics = { scrollHeight: 1000, clientHeight: 240 };
  const tops = new WeakMap<Element, number>();
  const saved: Record<string, PropertyDescriptor | undefined> = {};

  beforeEach(() => {
    metrics.scrollHeight = 1000;
    for (const name of ["scrollHeight", "clientHeight", "scrollTop"] as const) {
      saved[name] = Object.getOwnPropertyDescriptor(Element.prototype, name);
    }
    Object.defineProperty(Element.prototype, "scrollHeight", {
      configurable: true,
      get: () => metrics.scrollHeight,
    });
    Object.defineProperty(Element.prototype, "clientHeight", {
      configurable: true,
      get: () => metrics.clientHeight,
    });
    Object.defineProperty(Element.prototype, "scrollTop", {
      configurable: true,
      get(this: Element) {
        return tops.get(this) ?? 0;
      },
      set(this: Element, value: number) {
        tops.set(this, value);
      },
    });
  });

  afterEach(() => {
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(Element.prototype, name, descriptor);
      else delete (Element.prototype as unknown as Record<string, unknown>)[name];
    }
  });

  const scrollTo = (top: number) => {
    tops.set(log(), top);
    fireEvent.scroll(log());
  };

  test("starts at the end", () => {
    setup(fx.ownerId, 2);
    expect(log().scrollTop).toBe(1000);
  });

  test("follows new lines while the list is at its end", () => {
    const { push } = setup(fx.ownerId, 2);
    scrollTo(760);
    metrics.scrollHeight = 1300;
    push(2);
    expect(log().scrollTop).toBe(1300);
  });

  test("stops following once the user scrolled up, and offers a way back", async () => {
    const { push } = setup(fx.ownerId, 2);
    const user = userEvent.setup();
    await user.click(toggle());
    expect(screen.queryByRole("button", { name: "Jump to latest" })).toBeNull();

    scrollTo(100);
    metrics.scrollHeight = 1300;
    push(2);
    expect(log().scrollTop).toBe(100);

    await user.click(screen.getByRole("button", { name: "Jump to latest" }));
    expect(log().scrollTop).toBe(1300);
    expect(log()).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Jump to latest" })).toBeNull();
  });

  test("follows again after the user scrolls back to the end", () => {
    const { push } = setup(fx.ownerId, 2);
    scrollTo(100);
    scrollTo(760);
    metrics.scrollHeight = 1400;
    push(2);
    expect(log().scrollTop).toBe(1400);
  });

  test("opening and closing go back to the latest line", async () => {
    setup(fx.ownerId, 2);
    const user = userEvent.setup();
    await user.click(toggle());
    scrollTo(0);
    await user.click(toggle());
    expect(log().scrollTop).toBe(1000);
  });
});
