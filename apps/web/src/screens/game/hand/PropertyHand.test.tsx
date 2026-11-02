import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { ApiError } from "../../../api.ts";
import { GameActionsContext, GameStoreProvider, createGameStore } from "../../../game/index.ts";
import type { GameActions } from "../../../game/index.ts";
import { snapshotMessage } from "../../../game/fixtures.ts";
import { BEACON_HILL, NORTH_STATION, POWER_WORKS, deal, skyWith } from "./fixtures.ts";
import type { DealSpec } from "./fixtures.ts";
import { HOVER_CLOSE_MS, HOVER_OPEN_MS, PropertyHand } from "./PropertyHand.tsx";

const handDeeds: DealSpec["deeds"] = [
  [1, "a"],
  [3, "a"],
  ...skyWith([0, 0, 0]),
  [BEACON_HILL, "a"],
  [NORTH_STATION, "a"],
  [POWER_WORKS, "a"],
];

function setup(
  spec: DealSpec = { deeds: handDeeds },
  actions: Partial<GameActions> = {},
  as: "owner" | "guest" = "owner",
) {
  const game = deal(spec);
  const store = createGameStore();
  store.applyStreamMessage(snapshotMessage(game.game, game.state));
  const send = actions.send ?? vi.fn<GameActions["send"]>().mockResolvedValue(undefined);
  let value: GameActions = {
    pending: false,
    error: null,
    ...actions,
    send,
  };
  const userId = as === "owner" ? game.ownerId : game.guestId;
  const wrap = (children: ReactNode) => (
    <GameStoreProvider store={store}>
      <GameActionsContext value={value}>{children}</GameActionsContext>
    </GameStoreProvider>
  );
  const view = render(wrap(<PropertyHand userId={userId} />));
  const rerender = (next: Partial<GameActions>) => {
    value = { ...value, ...next };
    view.rerender(wrap(<PropertyHand userId={userId} />));
  };
  const update = (next: DealSpec) => {
    const again = deal(next, {
      game: game.game,
      ownerId: game.ownerId,
      guestId: game.guestId,
      seats: game.seats,
    });
    act(() =>
      store.applyStreamMessage(snapshotMessage(game.game, again.state, again.state.version)),
    );
  };
  return {
    ...game,
    store,
    send,
    view,
    rerender,
    update,
    user: userEvent.setup(),
  };
}

const toggle = () => screen.getByRole("button", { name: /properties,/ });
const openHand = async (t: ReturnType<typeof setup>) => {
  await t.user.click(toggle());
};
const cardButton = (name: RegExp) => screen.getByRole("button", { name });

const tick = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

afterEach(() => {
  vi.useRealTimers();
});

describe("PropertyHand: collapsed", () => {
  test("one root element, labelled with the owner, the count and the value", () => {
    const { view } = setup();
    expect(view.container.children).toHaveLength(1);
    expect(toggle()).toHaveAccessibleName("Ann's properties, 8 properties, $1,010");
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(toggle()).not.toHaveAttribute("aria-controls");
  });

  test("shows the stacks with their counts but no card buttons", () => {
    setup();
    expect(screen.getByText("Sky · 3")).toBeInTheDocument();
    expect(screen.getByText("Brown · 2")).toBeInTheDocument();
    expect(screen.getByText("Red")).toBeInTheDocument();
    expect(screen.getByText("Stations")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Lantern Row/ })).not.toBeInTheDocument();
  });

  test("a hand with no property says so when opened", async () => {
    const t = setup({ deeds: [] });
    expect(toggle()).toHaveAccessibleName("Ann's properties, 0 properties, $0");
    await openHand(t);
    expect(screen.getByText("No properties yet.")).toBeInTheDocument();
  });
});

describe("PropertyHand: expanded", () => {
  test("a click pins it open, a second click closes it", async () => {
    const t = setup();
    await openHand(t);
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(toggle()).toHaveAttribute("aria-controls");
    expect(screen.getAllByRole("button", { name: /\$/ })).not.toHaveLength(0);
    await t.user.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  test("the cards are buttons in lists grouped by colour, in board order", async () => {
    const t = setup();
    await openHand(t);
    const brown = screen.getByRole("list", { name: /Brown · 2/ });
    expect(
      within(brown)
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-label")),
    ).toEqual([
      "Driftwood Lane, $60, no buildings, Rent $4",
      "Kelp Court, $60, no buildings, Rent $8",
    ]);
    const sky = screen.getByRole("list", { name: /Sky · 3, set complete/ });
    expect(within(sky).getAllByRole("button")).toHaveLength(3);
    // Stack order: brown, sky, red, stations, utilities.
    const order = screen
      .getAllByRole("list")
      .map((l) => l.getAttribute("aria-labelledby"))
      .filter(Boolean)
      .map((id) => document.getElementById(id as string)?.textContent);
    expect(order).toEqual([
      "Brown · 2, set complete",
      "Sky · 3, set complete",
      "Red",
      "Stations",
      "Utilities",
    ]);
  });

  test("a card shows houses, the mortgaged state and the rent in its name", async () => {
    const t = setup({
      deeds: [
        ...skyWith([2, 1, 1]).slice(0, 1),
        [8, "a", { houses: 1 }],
        [9, "a", { houses: 1 }],
        [NORTH_STATION, "a", { mortgaged: true }],
        [POWER_WORKS, "a"],
      ],
    });
    await openHand(t);
    expect(cardButton(/Lantern Row/)).toHaveAccessibleName("Lantern Row, $100, 2 houses, Rent $90");
    expect(cardButton(/North Station/)).toHaveAccessibleName(
      "North Station, $200, mortgaged, No rent",
    );
    expect(cardButton(/Power Works/)).toHaveAccessibleName(
      "Power Works, $150, no buildings, 4× dice",
    );
  });

  test("a hotel is named", async () => {
    const t = setup({ deeds: skyWith([5, 5, 5]) });
    await openHand(t);
    expect(cardButton(/Lantern Row/)).toHaveAccessibleName("Lantern Row, $100, hotel, Rent $550");
  });

  test("focus entering the hand opens it, Esc closes it and keeps the focus on the toggle", async () => {
    const t = setup();
    await t.user.tab();
    expect(toggle()).toHaveFocus();
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    await t.user.tab();
    expect(cardButton(/Driftwood Lane/)).toHaveFocus();
    await t.user.keyboard("{Escape}");
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(toggle()).toHaveFocus();
  });

  test("Esc closes a pinned hand", async () => {
    const t = setup();
    await openHand(t);
    await t.user.keyboard("{Escape}");
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  test("the pointer opens it after a delay and closes it after another", () => {
    vi.useFakeTimers();
    setup();
    const surface = toggle().closest(".property-hand__surface") as HTMLElement;
    act(() => {
      surface.dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body }),
      );
    });
    tick(HOVER_OPEN_MS - 1);
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    tick(1);
    expect(toggle()).toHaveAttribute("aria-expanded", "true");

    act(() => {
      surface.dispatchEvent(
        new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }),
      );
    });
    tick(HOVER_CLOSE_MS - 1);
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    tick(1);
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  test("a pinned hand stays open when the pointer leaves", () => {
    vi.useFakeTimers();
    setup();
    const surface = toggle().closest(".property-hand__surface") as HTMLElement;
    act(() => toggle().click());
    act(() => {
      surface.dispatchEvent(
        new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }),
      );
    });
    tick(HOVER_CLOSE_MS * 2);
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
  });
});

describe("PropertyHand: managing", () => {
  test("selecting a card shows its actions with the costs", async () => {
    const t = setup();
    await openHand(t);
    const card = cardButton(/Lantern Row/);
    expect(card).toHaveAttribute("aria-expanded", "false");
    await t.user.click(card);
    expect(card).toHaveAttribute("aria-expanded", "true");
    const actions = screen.getByRole("group", { name: "Lantern Row actions" });
    expect(card).toHaveAttribute("aria-controls", actions.id);
    expect(within(actions).getByRole("button", { name: "Build $50" })).toHaveAttribute(
      "aria-disabled",
      "false",
    );
    expect(within(actions).getByRole("button", { name: "Sell building +$25" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(within(actions).getByText("No buildings to sell")).toBeInTheDocument();
    expect(within(actions).getByRole("button", { name: "Mortgage +$50" })).toHaveAttribute(
      "aria-disabled",
      "false",
    );
    expect(within(actions).queryByRole("button", { name: /Unmortgage/ })).not.toBeInTheDocument();

    await t.user.click(card);
    expect(screen.queryByRole("group", { name: "Lantern Row actions" })).not.toBeInTheDocument();
  });

  test("Build sends Build with the square for the shown seat", async () => {
    const t = setup();
    await openHand(t);
    await t.user.click(cardButton(/Cobble Street/));
    await t.user.click(screen.getByRole("button", { name: "Build $50" }));
    expect(t.send).toHaveBeenCalledExactlyOnceWith(
      { type: "Build", square: 8 },
      { seatId: t.id("a") },
    );
  });

  test("Sell building, Mortgage and Unmortgage send their engine actions", async () => {
    const t = setup({
      deeds: [
        ...skyWith([1, 0, 0]).slice(0, 1),
        [BEACON_HILL, "a"],
        [NORTH_STATION, "a", { mortgaged: true }],
      ],
    });
    await openHand(t);

    await t.user.click(cardButton(/Lantern Row/));
    await t.user.click(screen.getByRole("button", { name: "Sell building +$25" }));
    expect(t.send).toHaveBeenLastCalledWith(
      { type: "SellBuilding", square: 6 },
      { seatId: t.id("a") },
    );

    await t.user.click(cardButton(/Beacon Hill/));
    await t.user.click(screen.getByRole("button", { name: "Mortgage +$110" }));
    expect(t.send).toHaveBeenLastCalledWith(
      { type: "Mortgage", square: 21 },
      { seatId: t.id("a") },
    );

    await t.user.click(cardButton(/North Station/));
    await t.user.click(screen.getByRole("button", { name: "Unmortgage $110" }));
    expect(t.send).toHaveBeenLastCalledWith(
      { type: "Unmortgage", square: 5 },
      { seatId: t.id("a") },
    );
    expect(t.send).toHaveBeenCalledTimes(3);
  });

  test("a station has no Build or Sell button", async () => {
    const t = setup();
    await openHand(t);
    await t.user.click(cardButton(/North Station/));
    const actions = screen.getByRole("group", { name: "North Station actions" });
    expect(within(actions).getAllByRole("button")).toHaveLength(1);
    expect(within(actions).getByRole("button", { name: "Mortgage +$100" })).toHaveAttribute(
      "aria-disabled",
      "false",
    );
  });

  test("the last step to a hotel is named", async () => {
    const t = setup({ deeds: skyWith([4, 4, 4]) });
    await openHand(t);
    await t.user.click(cardButton(/Lantern Row/));
    expect(screen.getByRole("button", { name: "Build hotel $50" })).toHaveAttribute(
      "aria-disabled",
      "false",
    );
  });

  test("a refused action is disabled and says why", async () => {
    const t = setup({ deeds: skyWith([1, 0, 0]) });
    await openHand(t);
    await t.user.click(cardButton(/Lantern Row/));
    const build = screen.getByRole("button", { name: "Build $50" });
    expect(build).toHaveAttribute("aria-disabled", "true");
    expect(build).toHaveAccessibleDescription("Build on a street with fewer buildings first");
    expect(screen.getByRole("button", { name: "Mortgage +$50" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByText("Sell the buildings first")).toBeInTheDocument();
    await t.user.click(build);
    expect(t.send).not.toHaveBeenCalled();
  });

  test("an incomplete set says which set is needed", async () => {
    const t = setup();
    await openHand(t);
    await t.user.click(cardButton(/Beacon Hill/));
    expect(screen.getByText("Needs the full Red set")).toBeInTheDocument();
  });

  test("not enough cash", async () => {
    const t = setup({ deeds: skyWith([0, 0, 0]), cash: { a: 20 } });
    await openHand(t);
    await t.user.click(cardButton(/Lantern Row/));
    expect(screen.getByRole("button", { name: "Build $50" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByText("Needs $50")).toBeInTheDocument();
  });

  test("selection ends when the hand closes", async () => {
    const t = setup();
    await openHand(t);
    await t.user.click(cardButton(/Lantern Row/));
    await t.user.keyboard("{Escape}");
    await openHand(t);
    expect(cardButton(/Lantern Row/)).toHaveAttribute("aria-expanded", "false");
  });

  test("it is view-only outside a manage window", async () => {
    const t = setup({ deeds: handDeeds, phase: "awaiting_buy_decision" });
    await openHand(t);
    await t.user.click(cardButton(/Lantern Row/));
    const actions = screen.getByRole("group", { name: "Lantern Row actions" });
    expect(within(actions).queryByRole("button")).not.toBeInTheDocument();
    expect(
      within(actions).getByText("View only: decide on the property first"),
    ).toBeInTheDocument();
  });
});

describe("PropertyHand: pending and errors", () => {
  test("every action is disabled while an action is on its way", async () => {
    const t = setup({ deeds: skyWith([0, 0, 0]) }, { pending: true });
    await openHand(t);
    await t.user.click(cardButton(/Lantern Row/));
    const actions = screen.getByRole("group", { name: "Lantern Row actions" });
    for (const button of within(actions).getAllByRole("button"))
      expect(button).toHaveAttribute("aria-disabled", "true");
    expect(t.send).not.toHaveBeenCalled();
  });

  test("a button keeps the keyboard focus when the action goes pending", async () => {
    const t = setup({ deeds: skyWith([0, 0, 0]) });
    await openHand(t);
    await t.user.click(cardButton(/Lantern Row/));
    const build = screen.getByRole("button", { name: "Build $50" });
    build.focus();
    t.rerender({ pending: true });
    expect(build).toHaveFocus();
    expect(build).toHaveAttribute("aria-disabled", "true");
  });

  test("the live region is there without an error and shows a rejected action", () => {
    const quiet = setup();
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toBeEmptyDOMElement();
    quiet.view.unmount();

    setup(undefined, {
      error: new ApiError(
        409,
        "uneven_build",
        "Build evenly: build on a street with fewer buildings first",
      ),
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Build evenly: build on a street with fewer buildings first",
    );
  });

  test("a rejected send does not break the hand", async () => {
    const send = vi
      .fn<GameActions["send"]>()
      .mockRejectedValue(new ApiError(409, "not_your_turn", "no"));
    const t = setup(undefined, { send });
    await openHand(t);
    await t.user.click(cardButton(/Lantern Row/));
    await t.user.click(screen.getByRole("button", { name: "Build $50" }));
    expect(send).toHaveBeenCalledOnce();
    expect(toggle()).toBeInTheDocument();
  });
});

describe("PropertyHand: whose hand", () => {
  // The owner device has seat a (Ann) and the hot-seat seat c (Cy). Seat b (Bo) is remote.
  const both: DealSpec["deeds"] = [
    ...skyWith([0, 0, 0]),
    [BEACON_HILL, "c"],
    [NORTH_STATION, "c"],
    [1, "b"],
  ];

  test("the acting seat of this device is shown, with no switcher", () => {
    setup({ deeds: both, current: "c" });
    expect(toggle()).toHaveAccessibleName(/^Cy's properties, 2 properties/);
    expect(screen.queryByRole("group", { name: "Show properties of" })).not.toBeInTheDocument();
  });

  test("on a remote turn a switcher picks the seat, and actions use the picked seat", async () => {
    const t = setup({ deeds: both, current: "b" });
    expect(toggle()).toHaveAccessibleName(/^Ann's properties, 3 properties/);
    const switcher = screen.getByRole("group", { name: "Show properties of" });
    expect(
      within(switcher)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Ann", "Cy"]);
    expect(within(switcher).getByRole("button", { name: "Ann" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await t.user.click(within(switcher).getByRole("button", { name: "Cy" }));
    expect(toggle()).toHaveAccessibleName(/^Cy's properties, 2 properties/);
    expect(within(switcher).getByRole("button", { name: "Cy" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("on a remote turn the cards are view-only", async () => {
    const t = setup({ deeds: both, current: "b" });
    await openHand(t);
    await t.user.click(cardButton(/Lantern Row/));
    expect(screen.getByText("View only: wait for your turn")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Build/ })).not.toBeInTheDocument();
  });

  test("it keeps the last seat of this device that acted when the turn goes to a remote seat", () => {
    const t = setup({ deeds: both, current: "c" });
    expect(toggle()).toHaveAccessibleName(/^Cy's/);
    t.update({ deeds: both, current: "b", version: 1 });
    expect(toggle()).toHaveAccessibleName(/^Cy's/);
    t.update({ deeds: both, current: "a", version: 2 });
    expect(toggle()).toHaveAccessibleName(/^Ann's/);
    expect(screen.queryByRole("group", { name: "Show properties of" })).not.toBeInTheDocument();
  });

  test("a hot-seat device sends actions for the seat on turn", async () => {
    const t = setup({
      deeds: [...skyWith([0, 0, 0]).map(([s, , d]) => [s, "c", d] as const)],
      current: "c",
    });
    await openHand(t);
    await t.user.click(cardButton(/Lantern Row/));
    await t.user.click(screen.getByRole("button", { name: "Build $50" }));
    expect(t.send).toHaveBeenCalledExactlyOnceWith(
      { type: "Build", square: 6 },
      { seatId: t.id("c") },
    );
  });

  test("a guest sees its own seat only, with no switcher", () => {
    setup({ deeds: [...both, [8, "b"]], current: "b" }, {}, "guest");
    expect(toggle()).toHaveAccessibleName(/^Bo's properties, 2 properties/);
    expect(screen.queryByRole("group", { name: "Show properties of" })).not.toBeInTheDocument();
  });

  test("a debt opens the hand by itself and shows what is owed", () => {
    setup({ deeds: skyWith([1, 1, 1]), phase: "awaiting_debt", owes: { a: 320 } });
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Owes $320")).toBeInTheDocument();
  });

  test("an empty root renders when the user has no seat", () => {
    const { view } = setup({ deeds: both }, {}, "guest");
    view.unmount();
    const room = deal({ deeds: both });
    const store = createGameStore();
    store.applyStreamMessage(snapshotMessage(room.game, room.state));
    const out = render(
      <GameStoreProvider store={store}>
        <GameActionsContext
          value={{ send: vi.fn<GameActions["send"]>(), pending: false, error: null }}
        >
          <PropertyHand userId={crypto.randomUUID()} />
        </GameActionsContext>
      </GameStoreProvider>,
    );
    expect(out.container.children).toHaveLength(1);
    expect(out.container.querySelector("button")).toBeNull();
  });
});
