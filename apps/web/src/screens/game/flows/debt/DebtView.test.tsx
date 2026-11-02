import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { applyAction } from "@monopoly/game-engine";
import type { Action, Debt, GameState, Ownership } from "@monopoly/game-engine";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { ApiError } from "../../../../api.ts";
import { GameActionsContext } from "../../../../game/actions.ts";
import type { GameActions } from "../../../../game/actions.ts";
import { recordFixture, redact, snapshotMessage } from "../../../../game/fixtures.ts";
import { GameStoreProvider } from "../../../../game/GameStoreProvider.tsx";
import { createGameStore } from "../../../../game/store.ts";
import { centrePhases, TurnArea } from "../../turn/index.ts";
import { BankruptcyNotice, DebtView } from "./index.ts";

const fx = recordFixture(0);
const { a, b, c } = fx.seats;
const ids = { a: a.id, b: b.id, c: c.id };

// Squares: 1 Driftwood Lane and 3 Kelp Court (brown, houses $50), 5 North Station (mortgage $100),
// 15 East Station.
const own = (ownerId: string, houses = 0, mortgaged = false): Ownership => ({
  ownerId,
  houses,
  mortgaged,
});

interface Setup {
  /** The player on turn and debtor. */
  current?: "a" | "b" | "c";
  cash?: number;
  debts?: (Omit<Debt, "debtorId" | "creditor" | "then"> & {
    creditor?: "bank" | "a" | "b" | "c";
    then?: Debt["then"];
  })[];
  ownership?: Record<string, Ownership>;
}

function debtState({
  current = "a",
  cash = 100,
  debts = [{ amount: 250, reason: "rent", creditor: "b" }],
  ownership = {},
}: Setup = {}): GameState {
  const debtorId = ids[current];
  return {
    ...fx.start,
    version: 100,
    players: fx.start.players.map((p) => (p.id === debtorId ? { ...p, cash } : p)),
    ownership,
    debts: debts.map((d) => ({
      debtorId,
      amount: d.amount,
      reason: d.reason,
      creditor:
        d.creditor && d.creditor !== "bank"
          ? { type: "player", id: ids[d.creditor] }
          : { type: "bank" },
      then: d.then ?? "due_at_turn_start",
    })),
    turn: { currentPlayerId: debtorId, phase: "awaiting_debt", doubles: 0, dice: null },
  };
}

const brownSet = { "1": own(ids.a, 2), "3": own(ids.a, 2), "5": own(ids.a) };

function fakeActions(over: Partial<GameActions> = {}) {
  const send = vi.fn<GameActions["send"]>(() => Promise.resolve());
  const actions: GameActions = { send, pending: false, error: null, ...over };
  return { send, actions };
}

function renderDebt(full: GameState, userId = fx.ownerId, over: Partial<GameActions> = {}) {
  const store = createGameStore();
  store.applyStreamMessage(snapshotMessage(fx.game, redact(full)));
  const fake = fakeActions(over);
  const tree = (actions: GameActions) => (
    <GameStoreProvider store={store}>
      <GameActionsContext value={actions}>
        <TurnArea userId={userId} />
      </GameActionsContext>
    </GameStoreProvider>
  );
  const view = render(tree(fake.actions));
  return {
    ...view,
    ...fake,
    store,
    update: (next: Partial<GameActions>) => view.rerender(tree({ ...fake.actions, ...next })),
  };
}

/** The action as the server would run it: with the player id, on the full engine state. */
function accepted(full: GameState, playerId: string, input: Record<string, unknown>) {
  const result = applyAction(full, { ...input, playerId } as Action);
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}

const buttonNames = () => screen.queryAllByRole("button").map((button) => button.textContent);

beforeEach(() => {
  centrePhases.awaiting_debt = DebtView;
});
afterEach(() => {
  delete centrePhases.awaiting_debt;
});

describe("DebtView: cash is short", () => {
  test("shows who is paid, how much, why, the cash and the shortfall", () => {
    const { container } = renderDebt(debtState({ ownership: brownSet }));
    expect(container.children).toHaveLength(1);
    expect(screen.getByText("Rent to Bo")).toBeInTheDocument();
    expect(screen.getByText("$250")).toBeInTheDocument();
    expect(screen.getByText("Cash $100")).toBeInTheDocument();
    const status = screen.getByText("Still short by $150");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("role", "status");
  });

  test("keeps Pay disabled and says how much to raise", () => {
    renderDebt(debtState({ ownership: brownSet }));
    const pay = screen.getByRole("button", { name: "Pay $250" });
    expect(pay).toBeDisabled();
    expect(pay).toHaveAccessibleDescription("Raise $150 more first.");
  });

  test("lists buildings to sell, then properties to mortgage, with the board money", () => {
    renderDebt(debtState({ ownership: { ...brownSet, "15": own(ids.a, 0, true) } }));
    const list = within(screen.getByRole("region", { name: "Raise cash" })).getByRole("list");
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      "Driftwood LaneHas 2 housesSell +$25",
      "Kelp CourtHas 2 housesSell +$25",
      "North StationMortgage valueMortgage +$100",
    ]);
    // The mortgaged East Station has nothing left to raise. Brown streets still have houses.
    expect(screen.getByText(/Sell the buildings of a colour group/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mortgage Driftwood Lane for $30" }),
    ).not.toBeInTheDocument();
  });

  test("sends the exact engine action as the seat on turn, and the engine accepts it", async () => {
    const full = debtState({ ownership: brownSet });
    const { send } = renderDebt(full);

    await userEvent.click(
      screen.getByRole("button", { name: "Sell one building on Kelp Court for $25" }),
    );
    expect(send).toHaveBeenLastCalledWith({ type: "SellBuilding", square: 3 }, { seatId: a.id });
    accepted(full, a.id, { type: "SellBuilding", square: 3 });

    await userEvent.click(screen.getByRole("button", { name: "Mortgage North Station for $100" }));
    expect(send).toHaveBeenLastCalledWith({ type: "Mortgage", square: 5 }, { seatId: a.id });
    accepted(full, a.id, { type: "Mortgage", square: 5 });
    expect(send).toHaveBeenCalledTimes(2);
  });

  test("the shortfall falls as cash comes in, and Pay unlocks at zero", async () => {
    let full = debtState({ ownership: { "5": own(ids.a), "15": own(ids.a) }, cash: 100 });
    const view = renderDebt(full);
    expect(screen.getByText("Still short by $150")).toBeInTheDocument();

    full = accepted(full, a.id, { type: "Mortgage", square: 5 });
    view.store.applyStateResponse({ version: full.version, state: redact(full) });
    expect(await screen.findByText("Still short by $50")).toBeInTheDocument();
    expect(screen.getByText("Cash $200")).toBeInTheDocument();

    full = accepted(full, a.id, { type: "Mortgage", square: 15 });
    view.store.applyStateResponse({ version: full.version, state: redact(full) });
    expect(await screen.findByText("Your cash covers it")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Raise cash" })).not.toBeInTheDocument();

    const pay = screen.getByRole("button", { name: "Pay $250" });
    expect(pay).toBeEnabled();
    await userEvent.click(pay);
    expect(view.send).toHaveBeenCalledExactlyOnceWith({ type: "PayDebt" }, { seatId: a.id });
    accepted(full, a.id, { type: "PayDebt" });
  });

  test("refuses an uneven sale with the engine's reason", () => {
    renderDebt(debtState({ ownership: { "1": own(ids.a, 3), "3": own(ids.a, 2) } }));
    expect(
      screen.getByRole("button", { name: "Sell one building on Kelp Court for $25" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Sell one building on Driftwood Lane for $25" }),
    ).toBeEnabled();
    expect(screen.getByText(/Sell evenly/)).toBeInTheDocument();
  });

  test("tells the player when nothing is left to sell, and that the assets fall short", () => {
    renderDebt(debtState({ cash: 10, ownership: {} }));
    expect(screen.getByText("You have nothing left to sell or mortgage.")).toBeInTheDocument();
    expect(screen.getByText(/assets cannot cover this debt/)).toBeInTheDocument();
  });

  test("does not say the assets fall short while they cover the debt", () => {
    renderDebt(debtState({ ownership: brownSet }));
    expect(screen.queryByText(/assets cannot cover this debt/)).not.toBeInTheDocument();
  });

  test("shows the debts that wait behind the first one", () => {
    renderDebt(
      debtState({
        ownership: brownSet,
        debts: [
          { amount: 250, reason: "rent", creditor: "b" },
          { amount: 100, reason: "card", creditor: "bank" },
          { amount: 50, reason: "fine", creditor: "bank" },
        ],
      }),
    );
    expect(screen.getByText("After this you owe $150 more (2 debts).")).toBeInTheDocument();
  });

  test.each([
    ["tax", "Tax to the bank"],
    ["card", "Card payment to the bank"],
    ["fine", "Jail fine to the bank"],
  ] as const)("names a %s debt to the bank", (reason, label) => {
    renderDebt(
      debtState({ debts: [{ amount: 200, reason, creditor: "bank" }], ownership: brownSet }),
    );
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe("DebtView: cash covers the debt", () => {
  test("offers Pay and sends PayDebt", async () => {
    const full = debtState({ cash: 300 });
    const { send } = renderDebt(full);
    expect(screen.getByText("Your cash covers it")).toBeInTheDocument();
    const pay = screen.getByRole("button", { name: "Pay $250" });
    expect(pay).toBeEnabled();
    await userEvent.click(pay);
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: "PayDebt" }, { seatId: a.id });
    accepted(full, a.id, { type: "PayDebt" });
    expect(screen.queryByRole("region", { name: "Raise cash" })).not.toBeInTheDocument();
  });
});

describe("DebtView: bankruptcy", () => {
  test("starts a confirm step in the centre and sends nothing yet", async () => {
    const { send } = renderDebt(debtState({ ownership: brownSet }));
    await userEvent.click(screen.getByRole("button", { name: "Declare bankruptcy" }));
    expect(send).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const confirm = screen.getByRole("group", { name: "Declare bankruptcy?" });
    expect(
      within(confirm).getByText(/Bo receives all your cash and all your properties/),
    ).toBeInTheDocument();
    expect(within(confirm).getByText("This cannot be undone.")).toBeInTheDocument();
    expect(within(confirm).getByRole("button", { name: "Keep playing" })).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Pay $250" })).not.toBeInTheDocument();
  });

  test("Keep playing goes back to the debt and returns the focus", async () => {
    const { send } = renderDebt(debtState({ ownership: brownSet }));
    await userEvent.click(screen.getByRole("button", { name: "Declare bankruptcy" }));
    await userEvent.click(screen.getByRole("button", { name: "Keep playing" }));
    expect(screen.getByRole("button", { name: "Pay $250" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Declare bankruptcy" })).toHaveFocus();
    expect(send).not.toHaveBeenCalled();
  });

  test("the confirm sends Resign as the debtor, and the engine accepts it", async () => {
    const full = debtState({ ownership: brownSet });
    const { send } = renderDebt(full);
    await userEvent.click(screen.getByRole("button", { name: "Declare bankruptcy" }));
    await userEvent.click(
      within(screen.getByRole("group", { name: "Declare bankruptcy?" })).getByRole("button", {
        name: "Declare bankruptcy",
      }),
    );
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: "Resign" }, { seatId: a.id });
    const after = accepted(full, a.id, { type: "Resign" });
    expect(after.players.find((p) => p.id === a.id)?.active).toBe(false);
  });

  test("says the bank takes everything when the debt is owed to the bank", async () => {
    const full = debtState({
      debts: [{ amount: 200, reason: "tax", creditor: "bank" }],
      ownership: brownSet,
    });
    renderDebt(full);
    await userEvent.click(screen.getByRole("button", { name: "Declare bankruptcy" }));
    expect(screen.getByText(/Everything goes to the bank/)).toBeInTheDocument();
    expect(screen.getByText(/auctions the properties one by one/)).toBeInTheDocument();
    accepted(full, a.id, { type: "Resign" });
  });

  test("names every creditor when the debts are owed to several players", async () => {
    renderDebt(
      debtState({
        ownership: brownSet,
        debts: [
          { amount: 250, reason: "rent", creditor: "b" },
          { amount: 100, reason: "card", creditor: "c" },
        ],
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Declare bankruptcy" }));
    expect(
      screen.getByText(/split between Bo, Cy by what you owe each of them/),
    ).toBeInTheDocument();
    expect(screen.getByText(/owed the most receives your properties/)).toBeInTheDocument();
  });

  test("is offered only to the seat that owes the debt", () => {
    renderDebt(debtState({ ownership: brownSet }), fx.guestId);
    expect(screen.queryByRole("button", { name: "Declare bankruptcy" })).not.toBeInTheDocument();
  });

  test("stays disabled while an action is pending", () => {
    renderDebt(debtState({ ownership: brownSet }), fx.ownerId, { pending: true });
    expect(screen.getByRole("button", { name: "Declare bankruptcy" })).toBeDisabled();
  });
});

describe("DebtView: other devices and seats", () => {
  test("a device with no seat on turn sees who must settle which debt, and no buttons", () => {
    const { container } = renderDebt(debtState({ ownership: brownSet }), fx.guestId);
    expect(container.children).toHaveLength(1);
    expect(screen.getByText("Waiting for Ann to settle a debt")).toBeInTheDocument();
    expect(screen.getByText("Rent to Bo: $250")).toBeInTheDocument();
    expect(buttonNames()).toEqual([]);
    expect(screen.queryByRole("region", { name: "Raise cash" })).not.toBeInTheDocument();
  });

  test("the owner sees the wait for a debtor on the other device", () => {
    renderDebt(
      debtState({
        current: "b",
        ownership: { "5": own(ids.b) },
        debts: [{ amount: 90, reason: "tax", creditor: "bank" }],
      }),
    );
    expect(screen.getByText("Waiting for Bo to settle a debt")).toBeInTheDocument();
    expect(buttonNames()).toEqual([]);
  });

  test("hot-seat: the seat on turn pays and raises cash, and resigns as that seat", async () => {
    const full = debtState({
      current: "c",
      ownership: { "5": own(ids.c), "1": own(ids.c, 1) },
      debts: [{ amount: 250, reason: "rent", creditor: "a" }],
    });
    const { send } = renderDebt(full);
    expect(screen.getByText("Cy owes")).toBeInTheDocument();
    expect(screen.getByText("Rent to Ann")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Mortgage North Station for $100" }));
    expect(send).toHaveBeenLastCalledWith({ type: "Mortgage", square: 5 }, { seatId: c.id });

    await userEvent.click(screen.getByRole("button", { name: "Declare bankruptcy" }));
    expect(screen.getByText(/Ann receives all your cash/)).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole("group", { name: "Declare bankruptcy?" })).getByRole("button", {
        name: "Declare bankruptcy",
      }),
    );
    expect(send).toHaveBeenLastCalledWith({ type: "Resign" }, { seatId: c.id });
  });

  test("hot-seat: Pay goes as the seat on turn", async () => {
    const { send } = renderDebt(debtState({ current: "c", cash: 500 }));
    await userEvent.click(screen.getByRole("button", { name: "Pay $250" }));
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: "PayDebt" }, { seatId: c.id });
  });
});

describe("DebtView: pending and error", () => {
  test("disables every button while an action is on its way", () => {
    renderDebt(debtState({ ownership: brownSet }), fx.ownerId, { pending: true });
    expect(screen.getByRole("button", { name: "Pay $250" })).toBeDisabled();
    for (const button of within(screen.getByRole("region", { name: "Raise cash" })).getAllByRole(
      "button",
    )) {
      expect(button).toBeDisabled();
    }
  });

  test("does not send a second action while one is pending", async () => {
    const { send } = renderDebt(debtState({ ownership: brownSet }), fx.ownerId, { pending: true });
    await userEvent.click(screen.getByRole("button", { name: "Mortgage North Station for $100" }));
    expect(send).not.toHaveBeenCalled();
  });

  test("shows a rejected action in the live region of the turn area", () => {
    const view = renderDebt(debtState({ ownership: brownSet }));
    expect(screen.queryByText("Raise cash first")).not.toBeInTheDocument();
    view.update({ error: new ApiError(422, "insufficient_funds", "Raise cash first") });
    expect(screen.getByText("Raise cash first")).toBeInTheDocument();
    expect(screen.getByText("Raise cash first").closest("[aria-live]")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });
});

describe("BankruptcyNotice", () => {
  test("names the player and the creditor", () => {
    const { container } = render(<BankruptcyNotice playerName="Marlow" creditorName="Ines" />);
    expect(container.children).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("Marlow is out of the game");
    expect(screen.getByText("Ines receives the cash and the properties.")).toBeInTheDocument();
  });

  test("says the bank takes the assets when there is no creditor", () => {
    render(<BankruptcyNotice playerName="Marlow" creditorName={null} />);
    expect(
      screen.getByText("Everything goes to the bank. The properties are auctioned."),
    ).toBeInTheDocument();
  });
});
