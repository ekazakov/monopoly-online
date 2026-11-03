import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Phase, RedactedGameState } from "@monopoly/shared";
import { describe, expect, test, vi } from "vite-plus/test";
import { GameActionsContext } from "../../../game/actions.ts";
import type { GameActions } from "../../../game/actions.ts";
import { recordFixture, redact, snapshotMessage } from "../../../game/fixtures.ts";
import { GameStoreProvider } from "../../../game/GameStoreProvider.tsx";
import { createGameStore } from "../../../game/store.ts";
import { DebugPanel, debugAccess, deedChanges, deedDraft, parseCash } from "./index.ts";
import { DEED_GROUPS } from "./debugModel.ts";

const fx = recordFixture(1);
const { a, b, c } = fx.seats;
// Ann is on turn, so the engine start state (a random first player) is moved to her.
const raw = redact(fx.start);
const start: RedactedGameState = {
  ...raw,
  turn: { ...raw.turn, currentPlayerId: a.id, phase: "awaiting_roll" },
};
const inPhase = (phase: Phase): RedactedGameState => ({ ...start, turn: { ...start.turn, phase } });

function setup({ userId = fx.ownerId, state = start } = {}) {
  const store = createGameStore();
  act(() => store.applyStreamMessage(snapshotMessage(fx.game, state)));
  const send = vi.fn<GameActions["send"]>(() => Promise.resolve());
  const actions: GameActions = { send, pending: false, error: null };
  render(
    <GameStoreProvider store={store}>
      <GameActionsContext value={actions}>
        <DebugPanel userId={userId} />
      </GameActionsContext>
    </GameStoreProvider>,
  );
  return { send };
}

async function openPanel() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Debug" }));
  return user;
}

describe("debugModel", () => {
  test("the player on turn may edit, in the allowed phases only", () => {
    expect(debugAccess(fx.game, start, fx.ownerId).seat?.id).toBe(a.id);
    expect(debugAccess(fx.game, start, fx.guestId)).toEqual({
      seat: null,
      reason: "Wait for your turn.",
    });
    expect(debugAccess(fx.game, inPhase("awaiting_buy_decision"), fx.ownerId).seat).toBeNull();
    expect(debugAccess(fx.game, inPhase("game_over"), fx.ownerId).reason).toBe("The game is over.");
  });

  test("a deed draft follows the deed and a bank deed sends no buildings", () => {
    const owned = { ...start, ownership: { "3": { ownerId: b.id, houses: 2, mortgaged: false } } };
    expect(deedDraft(owned, 3)).toEqual({ ownerId: b.id, houses: 2, mortgaged: false });
    expect(deedDraft(owned, 1)).toEqual({ ownerId: "", houses: 0, mortgaged: false });
    expect(deedChanges([3], { ownerId: "", houses: 4, mortgaged: true })).toEqual([
      { kind: "deed", square: 3, ownerId: null, houses: 0, mortgaged: false },
    ]);
    expect(deedChanges([3], { ownerId: c.id, houses: 4, mortgaged: true })).toMatchObject([
      { houses: 0, mortgaged: true },
    ]);
  });

  test("one batch holds a change for each chosen deed, and only streets keep buildings", () => {
    const changes = deedChanges([1, 5, 12], { ownerId: b.id, houses: 3, mortgaged: false });
    expect(changes).toEqual([
      { kind: "deed", square: 1, ownerId: b.id, houses: 3, mortgaged: false },
      { kind: "deed", square: 5, ownerId: b.id, houses: 0, mortgaged: false },
      { kind: "deed", square: 12, ownerId: b.id, houses: 0, mortgaged: false },
    ]);
  });

  test("the deeds are in three groups, each in board order", () => {
    expect(DEED_GROUPS.map((g) => [g.label, g.options.length])).toEqual([
      ["Streets", 22],
      ["Stations", 4],
      ["Utilities", 2],
    ]);
    for (const group of DEED_GROUPS) {
      const squares = group.options.map((o) => o.square);
      expect(squares).toEqual([...squares].sort((x, y) => x - y));
    }
  });

  test("cash must be a whole number, 0 or more", () => {
    expect(parseCash(" 250 ")).toBe(250);
    expect(parseCash("0")).toBe(0);
    for (const bad of ["", "-5", "1.5", "abc"]) expect(parseCash(bad)).toBeNull();
  });
});

describe("DebugPanel", () => {
  test("sets the cash of another player", async () => {
    const { send } = setup();
    const user = await openPanel();
    const field = screen.getByLabelText(b.name);
    await user.clear(field);
    await user.type(field, "75");
    await user.click(screen.getByRole("button", { name: `Set ${b.name}'s cash` }));
    expect(send).toHaveBeenCalledWith(
      { type: "DebugEdit", changes: [{ kind: "cash", targetId: b.id, cash: 75 }] },
      { seatId: a.id, source: "menu" },
    );
    expect(await screen.findByRole("status")).toHaveTextContent(`${b.name}'s cash is now $75.`);
  });

  test("gives a deed with buildings to a player", async () => {
    const { send } = setup();
    const user = await openPanel();
    const deeds = screen.getByRole("group", { name: "Deeds" });
    const list = within(deeds).getByLabelText("Choose");
    // The first deed is chosen at the start. Swap it for Kelp Court.
    await user.deselectOptions(list, "1");
    await user.selectOptions(list, "3");
    await user.selectOptions(within(deeds).getByLabelText("Owner"), c.id);
    await user.selectOptions(within(deeds).getByLabelText("Buildings"), "5");
    await user.click(within(deeds).getByRole("button", { name: "Apply" }));
    expect(send).toHaveBeenCalledWith(
      {
        type: "DebugEdit",
        changes: [{ kind: "deed", square: 3, ownerId: c.id, houses: 5, mortgaged: false }],
      },
      { seatId: a.id, source: "menu" },
    );
  });

  test("gives several deeds from the three groups in one action", async () => {
    const { send } = setup();
    const user = await openPanel();
    const deeds = screen.getByRole("group", { name: "Deeds" });
    const list = within(deeds).getByLabelText("Choose");
    expect(
      within(list)
        .getAllByRole("group")
        .map((g) => g.getAttribute("label")),
    ).toEqual(["Streets", "Stations", "Utilities"]);
    // The first deed is chosen at the start. Add a station and a utility.
    await user.selectOptions(list, ["1", "5", "12"]);
    await user.selectOptions(within(deeds).getByLabelText("Owner"), c.id);
    await user.selectOptions(within(deeds).getByLabelText("Buildings"), "2");
    expect(within(deeds).getByText(/3 chosen/)).toBeInTheDocument();
    await user.click(within(deeds).getByRole("button", { name: "Apply" }));
    expect(send).toHaveBeenCalledWith(
      {
        type: "DebugEdit",
        changes: [
          { kind: "deed", square: 1, ownerId: c.id, houses: 2, mortgaged: false },
          { kind: "deed", square: 5, ownerId: c.id, houses: 0, mortgaged: false },
          { kind: "deed", square: 12, ownerId: c.id, houses: 0, mortgaged: false },
        ],
      },
      { seatId: a.id, source: "menu" },
    );
    expect(await screen.findByRole("status")).toHaveTextContent(`3 deeds now belong to ${c.name}.`);
  });

  test("moves a player token", async () => {
    const { send } = setup();
    const user = await openPanel();
    const tokens = screen.getByRole("group", { name: "Player tokens" });
    await user.selectOptions(within(tokens).getByLabelText("Player"), b.id);
    await user.selectOptions(within(tokens).getByLabelText("Square"), "10");
    await user.click(within(tokens).getByRole("button", { name: "Move" }));
    expect(send).toHaveBeenCalledWith(
      { type: "DebugEdit", changes: [{ kind: "position", targetId: b.id, square: 10 }] },
      { seatId: a.id, source: "menu" },
    );
  });

  test("off turn the controls are disabled and say why", async () => {
    setup({ userId: fx.guestId });
    await openPanel();
    expect(screen.getByText("Wait for your turn.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move" })).toBeDisabled();
    expect(screen.getByRole("button", { name: `Set ${a.name}'s cash` })).toBeDisabled();
  });
});
