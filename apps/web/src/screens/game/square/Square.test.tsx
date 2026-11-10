import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vite-plus/test";
import { GameActionsContext, GameStoreProvider, createGameStore } from "../../../game/index.ts";
import type { GameActions } from "../../../game/index.ts";
import { snapshotMessage } from "../../../game/fixtures.ts";
import { BEACON_HILL, NORTH_STATION, deal, skyWith } from "../hand/fixtures.ts";
import type { DealSpec } from "../hand/fixtures.ts";
import { SquareDialogs, SquareViewProvider, SquaresButton } from "./index.ts";

const deeds: DealSpec["deeds"] = [
  [1, "a"],
  ...skyWith([1, 0, 0]),
  [BEACON_HILL, "a"],
  [NORTH_STATION, "b"],
];

function setup(spec: DealSpec = { deeds }, as: "owner" | "guest" = "owner") {
  const game = deal(spec);
  const store = createGameStore();
  store.applyStreamMessage(snapshotMessage(game.game, game.state));
  const send = vi.fn<GameActions["send"]>().mockResolvedValue(undefined);
  const actions: GameActions = { pending: false, error: null, send };
  const userId = as === "owner" ? game.ownerId : game.guestId;
  const wrap = (children: ReactNode) => (
    <GameStoreProvider store={store}>
      <GameActionsContext value={actions}>
        <SquareViewProvider>{children}</SquareViewProvider>
      </GameActionsContext>
    </GameStoreProvider>
  );
  render(
    wrap(
      <>
        <SquaresButton />
        <SquareDialogs userId={userId} />
      </>,
    ),
  );
  return { ...game, send, user: userEvent.setup(), store };
}

const openList = (t: ReturnType<typeof setup>) =>
  t.user.click(screen.getByRole("button", { name: "Squares" }));
const pick = async (t: ReturnType<typeof setup>, name: RegExp) => {
  await openList(t);
  await t.user.click(within(screen.getByRole("dialog")).getByRole("button", { name }));
};

describe("Squares button and the list", () => {
  test("opens a list of every property, grouped by colour, with the owner", async () => {
    const t = setup();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await openList(t);
    const dialog = screen.getByRole("dialog", { name: "Properties" });
    const groups = within(dialog)
      .getAllByRole("list")
      .map((l) => l.getAttribute("aria-label"));
    expect(groups).toEqual([
      "Brown",
      "Sky",
      "Pink",
      "Orange",
      "Red",
      "Yellow",
      "Green",
      "Navy",
      "Stations",
      "Utilities",
    ]);
    expect(within(dialog).getAllByRole("button", { name: /\$/ })).toHaveLength(28);
    expect(within(dialog).getByRole("button", { name: /Driftwood Lane/ })).toHaveTextContent("Ann");
    expect(within(dialog).getByRole("button", { name: /North Station/ })).toHaveTextContent("Bo");
    expect(within(dialog).getByRole("button", { name: /Pump House/ })).toHaveTextContent(
      "Not owned",
    );
  });

  test("Esc closes the list", async () => {
    const t = setup();
    await openList(t);
    screen.getByRole("button", { name: /Driftwood Lane/ }).focus();
    await t.user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Square detail", () => {
  test("picking a property shows its title deed and its owner, and replaces the list", async () => {
    const t = setup();
    await pick(t, /Driftwood Lane/);
    const dialog = screen.getByRole("dialog", { name: "Driftwood Lane" });
    expect(dialog).toHaveTextContent("Owned by Ann");
    expect(dialog).toHaveTextContent("Mortgage value");
    expect(screen.queryByRole("dialog", { name: "Properties" })).not.toBeInTheDocument();
  });

  test("shows the buildings and the mortgaged state of an owned street", async () => {
    const t = setup();
    await pick(t, /Lantern Row/);
    expect(screen.getByRole("dialog", { name: "Lantern Row" })).toHaveTextContent(
      "Owned by Ann · 1 house",
    );
  });

  test("an unowned property says so and has no actions", async () => {
    const t = setup();
    await pick(t, /Pump House/);
    const dialog = screen.getByRole("dialog", { name: "Pump House" });
    expect(dialog).toHaveTextContent("Not owned");
    expect(within(dialog).queryByRole("button", { name: /Mortgage|Build/ })).toBeNull();
  });

  test("a property of a seat on another device is view only", async () => {
    const t = setup();
    await pick(t, /North Station/);
    const dialog = screen.getByRole("dialog", { name: "North Station" });
    expect(dialog).toHaveTextContent("Owned by Bo");
    expect(within(dialog).queryByRole("button", { name: /Mortgage|Unmortgage/ })).toBeNull();
  });

  test("the owner on this device sees the actions, and an action goes to the server as that seat", async () => {
    const t = setup();
    await pick(t, /Beacon Hill/);
    await t.user.click(screen.getByRole("button", { name: "Mortgage +$110" }));
    expect(t.send).toHaveBeenCalledExactlyOnceWith(
      { type: "Mortgage", square: BEACON_HILL },
      { seatId: t.seats.a.id, source: "square" },
    );
  });

  test("an action that the rules refuse is disabled and says why", async () => {
    const t = setup();
    await pick(t, /Driftwood Lane/);
    const dialog = screen.getByRole("dialog", { name: "Driftwood Lane" });
    const build = within(dialog).getByRole("button", { name: /^Build/ });
    expect(build).toHaveAttribute("aria-disabled", "true");
    await t.user.click(build);
    expect(t.send).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/Needs the full Brown set/)).toBeInTheDocument();
  });

  test("the Close button and Esc close the detail", async () => {
    const t = setup();
    await pick(t, /Beacon Hill/);
    await t.user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await pick(t, /Beacon Hill/);
    screen.getByRole("button", { name: /^Mortgage/ }).focus();
    await t.user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("a refusal from the server shows in the dialog only", async () => {
    const game = deal({ deeds });
    const store = createGameStore();
    store.applyStreamMessage(snapshotMessage(game.game, game.state));
    const send = vi.fn<GameActions["send"]>().mockResolvedValue(undefined);
    const error = Object.assign(new Error("Not your turn"), { status: 409 });
    const actions = {
      pending: false,
      error,
      errorSource: "square" as const,
      send,
    } as unknown as GameActions;
    render(
      <GameStoreProvider store={store}>
        <GameActionsContext value={actions}>
          <SquareViewProvider>
            <SquaresButton />
            <SquareDialogs userId={game.ownerId} />
          </SquareViewProvider>
        </GameActionsContext>
      </GameStoreProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Squares" }));
    await userEvent.click(screen.getByRole("button", { name: /Beacon Hill/ }));
    expect(screen.getAllByRole("status").map((s) => s.textContent)).toContain("Not your turn");
  });
});
