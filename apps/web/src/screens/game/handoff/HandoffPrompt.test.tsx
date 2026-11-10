import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { GameActionsContext, GameStoreProvider, createGameStore } from "../../../game/index.ts";
import { snapshotMessage } from "../../../game/fixtures.ts";
import { GameLayout } from "../GameLayout.tsx";
import { PropertyHand } from "../hand/index.ts";
import { deal } from "../hand/fixtures.ts";
import type { DealSpec, Who } from "../hand/fixtures.ts";
import { HandoffPrompt } from "./HandoffPrompt.tsx";

afterEach(cleanup);

const deeds: DealSpec["deeds"] = [
  [1, "a"],
  [3, "c"],
];

// `a` and `c` are on the owner's device, `b` on the guest's.
function setup(as: "owner" | "guest" = "owner", first: Who = "a") {
  const room = deal({ current: first, deeds });
  const store = createGameStore();
  store.applyStreamMessage(snapshotMessage(room.game, room.state));
  const userId = as === "owner" ? room.ownerId : room.guestId;
  let version = 0;
  const turnTo = (current: Who) => {
    version += 1;
    const next = deal({ current, deeds, version }, room);
    act(() => store.applyStreamMessage(snapshotMessage(room.game, next.state, version)));
  };
  render(
    <GameStoreProvider store={store}>
      <GameActionsContext value={{ pending: false, error: null, send: async () => {} }}>
        <GameLayout
          centre={<button type="button">Roll</button>}
          hand={<PropertyHand userId={userId} />}
          overlay={<HandoffPrompt userId={userId} />}
        />
      </GameActionsContext>
    </GameStoreProvider>,
  );
  return { turnTo, user: userEvent.setup() };
}

const prompt = () => screen.queryByRole("dialog");
const confirm = (name: string) =>
  screen.getByRole("button", { name: `I’m ${name}, start my turn` });

describe("HandoffPrompt", () => {
  test("shows for a change between two seats of this device", () => {
    const { turnTo } = setup();
    expect(prompt()).toBeNull();
    turnTo("c");
    expect(prompt()).toHaveAccessibleName("Pass to Cy");
    expect(screen.getByRole("heading", { name: "Pass to Cy" })).toBeInTheDocument();
    expect(screen.getByText("Next on this device")).toBeInTheDocument();
    expect(prompt()).toHaveTextContent(
      "Cy’s properties and actions stay hidden until they confirm.",
    );
  });

  test("moves focus to the confirm button", () => {
    const { turnTo } = setup();
    turnTo("c");
    expect(confirm("Cy")).toHaveFocus();
  });

  test("does not show on a device with one seat", () => {
    const { turnTo } = setup("guest", "b");
    turnTo("a");
    turnTo("b");
    expect(prompt()).toBeNull();
  });

  test("does not show for a seat on another device", () => {
    const { turnTo } = setup();
    turnTo("b");
    expect(prompt()).toBeNull();
    turnTo("c");
    expect(prompt()).toBeNull();
  });

  test("does not show on the first load, nor when the same seat acts again", () => {
    const { turnTo } = setup("owner", "c");
    expect(prompt()).toBeNull();
    turnTo("c");
    expect(prompt()).toBeNull();
  });

  test("does not show when the first snapshot arrives after the screen mounts", () => {
    const room = deal({ current: "a", deeds });
    const store = createGameStore();
    render(
      <GameStoreProvider store={store}>
        <GameLayout overlay={<HandoffPrompt userId={room.ownerId} />} />
      </GameStoreProvider>,
    );
    act(() => store.applyStreamMessage(snapshotMessage(room.game, room.state)));
    expect(prompt()).toBeNull();
  });

  test("confirm hides it, unlocks the screen and restores focus", async () => {
    const { turnTo, user } = setup();
    await user.click(screen.getByRole("button", { name: "Roll" }));
    const opener = screen.getByRole("button", { name: "Roll" });
    expect(opener).toHaveFocus();
    turnTo("c");
    await user.click(confirm("Cy"));
    expect(prompt()).toBeNull();
    expect(opener).toHaveFocus();
    expect(screen.getByRole("main").querySelector("[inert]")).toBeNull();
  });

  test("Enter and Space confirm", async () => {
    const { turnTo, user } = setup();
    turnTo("c");
    await user.keyboard("{Enter}");
    expect(prompt()).toBeNull();
    turnTo("a");
    expect(prompt()).not.toBeNull();
    await user.keyboard(" ");
    expect(prompt()).toBeNull();
  });

  test("the regions behind are inert and hidden from assistive technology", () => {
    const { turnTo } = setup();
    turnTo("c");
    const behind = document.querySelector(".game-layout__regions");
    expect(behind).toHaveAttribute("inert");
    expect(behind).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("button", { name: "Roll" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Property hand" })).not.toBeInTheDocument();
  });

  test("the next hand stays behind the opaque prompt and inert until confirm", async () => {
    const { turnTo, user } = setup();
    turnTo("c");
    const title = () => document.querySelector(".property-hand__tab");
    expect(title()?.closest("[inert]")).not.toBeNull();
    expect(title()?.closest(".game-layout__regions")).not.toContainElement(prompt());
    await user.click(confirm("Cy"));
    expect(title()).toHaveAccessibleName(/^Cy's properties/);
    expect(title()?.closest("[inert]")).toBeNull();
  });

  test("a newer handoff replaces the shown one and keeps the focus to restore", async () => {
    const { turnTo, user } = setup();
    await user.click(screen.getByRole("button", { name: "Roll" }));
    const opener = screen.getByRole("button", { name: "Roll" });
    turnTo("c");
    turnTo("a");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(prompt()).toHaveAccessibleName("Pass to Ann");
    expect(confirm("Ann")).toHaveFocus();
    await user.click(confirm("Ann"));
    expect(opener).toHaveFocus();
  });

  test("an unrelated change while shown (another device acts) drops the prompt", () => {
    const { turnTo } = setup();
    turnTo("c");
    turnTo("b");
    expect(prompt()).toBeNull();
  });

  test("uses no animation, so reduced motion changes nothing", () => {
    const { turnTo } = setup();
    turnTo("c");
    expect(prompt()?.getAnimations?.() ?? []).toHaveLength(0);
  });
});
