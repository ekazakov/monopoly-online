import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Phase, RedactedGameState } from "@monopoly/shared";
import { describe, expect, test, vi } from "vite-plus/test";
import { ApiError } from "../../../api.ts";
import { GameActionsContext } from "../../../game/actions.ts";
import type { GameActions } from "../../../game/actions.ts";
import { actionsMessage, recordFixture, redact, snapshotMessage } from "../../../game/fixtures.ts";
import { GameStoreProvider } from "../../../game/GameStoreProvider.tsx";
import { createGameStore } from "../../../game/store.ts";
import { centrePhases, TurnArea } from "./index.ts";

const fx = recordFixture(3);
const { a, b, c } = fx.seats;

interface Setup {
  phase: Phase;
  /** The player on turn. */
  current?: "a" | "b" | "c";
  player?: Partial<RedactedGameState["players"][number]>;
  turn?: Partial<RedactedGameState["turn"]>;
  /** Play the first recorded action first, so the log holds a roll. */
  withRoll?: boolean;
}

function stateFor({ phase, current = "a", player = {}, turn = {} }: Setup): RedactedGameState {
  const base = redact(fx.start);
  const currentPlayerId = fx.seats[current].id;
  return {
    ...base,
    version: 100,
    players: base.players.map((p) =>
      p.id === currentPlayerId ? { ...p, ...player } : { ...p, position: 0 },
    ),
    turn: { currentPlayerId, phase, doubles: 0, dice: null, ...turn },
  };
}

function makeStore(setup: Setup) {
  const store = createGameStore();
  store.applyStreamMessage(snapshotMessage(fx.game, redact(fx.start)));
  const step = fx.steps[0];
  if (setup.withRoll && step) store.applyStreamMessage(actionsMessage(fx.game, step));
  store.applyStateResponse({ version: 100, state: stateFor(setup) });
  return store;
}

function fakeActions(over: Partial<GameActions> = {}) {
  const send = vi.fn<GameActions["send"]>(() => Promise.resolve());
  const actions: GameActions = { send, pending: false, error: null, ...over };
  return { send, actions };
}

function renderTurn(setup: Setup, userId = fx.ownerId, over: Partial<GameActions> = {}) {
  const store = makeStore(setup);
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

const buttonNames = () => screen.queryAllByRole("button").map((button) => button.textContent);
// The buttons of the phase itself: the Trade button has its own tests.
const phaseButtons = () => buttonNames().filter((name) => name !== "Trade");

describe("TurnArea: shell", () => {
  test("renders one root element and handles the four turn phases", () => {
    const { container } = renderTurn({ phase: "awaiting_roll" });
    expect(container.children).toHaveLength(1);
    expect(Object.keys(centrePhases).sort()).toEqual([
      "awaiting_bid",
      "awaiting_buy_decision",
      "awaiting_debt",
      "awaiting_end_turn",
      "awaiting_jail_choice",
      "awaiting_roll",
      "awaiting_trade_response",
    ]);
  });

  test("shows a neutral waiting view before the game has a state", () => {
    render(
      <GameStoreProvider store={createGameStore()}>
        <GameActionsContext value={fakeActions().actions}>
          <TurnArea userId={fx.ownerId} />
        </GameActionsContext>
      </GameStoreProvider>,
    );
    expect(screen.getByText("Waiting for the game")).toBeInTheDocument();
    expect(buttonNames()).toEqual([]);
  });

  test.each([
    ["awaiting_bid", "Auction", "auction"] as const,
    ["awaiting_debt", "Debt to settle", "debt-view"] as const,
    ["awaiting_trade_response", "Trade offer", "trade-flow"] as const,
  ])("registers the %s view and not the neutral one", (phase, title, className) => {
    const { container } = renderTurn({ phase, current: "b" });
    expect(screen.getAllByText(new RegExp(title)).length).toBeGreaterThan(0);
    expect(container.querySelector(`.${className}`)).not.toBeNull();
    expect(container.querySelector(".turn-area__waiting, .trade-flow")).not.toBeNull();
  });

  test("shows no waiting line when the game is over", () => {
    renderTurn({ phase: "game_over" });
    expect(screen.getByText("Game over")).toBeInTheDocument();
    expect(screen.queryByText(/Waiting for/)).not.toBeInTheDocument();
  });
});

describe("TurnArea: awaiting_roll", () => {
  test("shows Roll on the turn of this device and sends RollDice as that seat", async () => {
    const { send } = renderTurn({ phase: "awaiting_roll", current: "a" });
    expect(screen.getByText(/Ann.s turn/)).toBeInTheDocument();
    expect(phaseButtons()).toEqual(["Roll"]);
    await userEvent.click(screen.getByRole("button", { name: "Roll" }));
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: "RollDice" }, { seatId: a.id });
  });

  test("shows the doubles indicator and the extra-turn hint after doubles", () => {
    renderTurn({
      phase: "awaiting_roll",
      turn: { doubles: 2, dice: [4, 4] },
    });
    expect(screen.getByText("Doubles ×2")).toBeInTheDocument();
    expect(
      screen.getByText("Roll again. Three doubles in a row sends you to jail."),
    ).toBeInTheDocument();
    expect(phaseButtons()).toEqual(["Roll again"]);
    expect(screen.getByRole("img", { name: "Dice: 4 and 4" })).toBeInTheDocument();
  });

  test("shows the last roll from the log, dimmed, before a new roll", () => {
    renderTurn({ phase: "awaiting_roll", withRoll: true });
    const rolled = fx.steps[0]?.events.find((event) => event.type === "DiceRolled");
    if (rolled?.type !== "DiceRolled") throw new Error("no roll in the fixture");
    const dice = screen.getByRole("img", {
      name: `Last roll: ${rolled.dice[0]} and ${rolled.dice[1]}`,
    });
    expect(dice).toHaveClass("turn-area__dice--dim");
  });

  test("shows blank dice when nothing was rolled yet", () => {
    renderTurn({ phase: "awaiting_roll" });
    expect(screen.getByRole("img", { name: "Dice: not rolled yet" })).toBeInTheDocument();
  });

  test("shows the roll of this turn at full strength", () => {
    renderTurn({ phase: "awaiting_roll", turn: { dice: [2, 5], doubles: 0 } });
    expect(screen.getByRole("img", { name: "Dice: 2 and 5" })).not.toHaveClass(
      "turn-area__dice--dim",
    );
  });

  test("sends the seat on turn of a hot-seat device", async () => {
    const { send } = renderTurn({ phase: "awaiting_roll", current: "c" });
    expect(screen.getByText(/Cy.s turn/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Roll" }));
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: "RollDice" }, { seatId: c.id });
  });
});

describe("TurnArea: awaiting_buy_decision", () => {
  const onDriftwood = { position: 1, cash: 500 };

  test("offers Buy at the listed price and Auction, with the title deed", async () => {
    const { send } = renderTurn({ phase: "awaiting_buy_decision", player: onDriftwood });
    expect(screen.getByText("Driftwood Lane is for sale")).toBeInTheDocument();
    expect(screen.getByText("Title deed")).toBeInTheDocument();
    expect(buttonNames()).toEqual(["Buy $60", "Auction"]);

    await userEvent.click(screen.getByRole("button", { name: "Buy $60" }));
    expect(send).toHaveBeenLastCalledWith({ type: "BuyProperty" }, { seatId: a.id });
    await userEvent.click(screen.getByRole("button", { name: "Auction" }));
    expect(send).toHaveBeenLastCalledWith({ type: "DeclineProperty" }, { seatId: a.id });
    expect(send).toHaveBeenCalledTimes(2);
  });

  test("disables Buy and says why when the cash is short, but Auction stays", async () => {
    const { send } = renderTurn({
      phase: "awaiting_buy_decision",
      player: { position: 1, cash: 30 },
    });
    const buy = screen.getByRole("button", { name: "Buy $60" });
    expect(buy).toBeDisabled();
    expect(buy).toHaveAccessibleDescription(/Not enough cash: \$30 of \$60/);
    await userEvent.click(buy);
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Auction" })).toBeEnabled();
  });

  test("shows a station with its price", () => {
    renderTurn({ phase: "awaiting_buy_decision", player: { position: 5, cash: 500 } });
    expect(screen.getByText("North Station is for sale")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buy $200" })).toBeEnabled();
  });
});

describe("TurnArea: awaiting_jail_choice", () => {
  const inJail = { inJail: true, position: 10, jailTurns: 0, cash: 500, heldJailCards: [] };

  test("offers roll, fine and card, and sends each action", async () => {
    const { send } = renderTurn({
      phase: "awaiting_jail_choice",
      player: { ...inJail, heldJailCards: ["chance"] },
    });
    expect(screen.getByText("In jail")).toBeInTheDocument();
    expect(screen.getByText("Attempt 1 of 3. Roll doubles, pay $50 or use a card.")).toBeVisible();
    expect(phaseButtons()).toEqual(["Roll for doubles", "Pay $50", "Use card"]);

    await userEvent.click(screen.getByRole("button", { name: "Roll for doubles" }));
    expect(send).toHaveBeenLastCalledWith({ type: "RollDice" }, { seatId: a.id });
    await userEvent.click(screen.getByRole("button", { name: "Pay $50" }));
    expect(send).toHaveBeenLastCalledWith({ type: "PayJailFine" }, { seatId: a.id });
    await userEvent.click(screen.getByRole("button", { name: "Use card" }));
    expect(send).toHaveBeenLastCalledWith({ type: "UseJailCard" }, { seatId: a.id });
  });

  test("disables Use card with a reason when the player holds none", () => {
    renderTurn({ phase: "awaiting_jail_choice", player: inJail });
    const card = screen.getByRole("button", { name: "Use card (none)" });
    expect(card).toBeDisabled();
    expect(card).toHaveAccessibleDescription("You hold no Get Out of Jail Free card.");
    expect(screen.getByRole("button", { name: "Pay $50" })).toBeEnabled();
  });

  test("disables Pay $50 with a reason when the cash is short", () => {
    renderTurn({ phase: "awaiting_jail_choice", player: { ...inJail, cash: 49 } });
    const pay = screen.getByRole("button", { name: "Pay $50" });
    expect(pay).toBeDisabled();
    expect(pay).toHaveAccessibleDescription("Paying the fine needs $50 cash.");
    expect(screen.getByRole("button", { name: "Roll for doubles" })).toBeEnabled();
  });

  test("warns on the last attempt", () => {
    renderTurn({ phase: "awaiting_jail_choice", player: { ...inJail, jailTurns: 2 } });
    expect(
      screen.getByText("Attempt 3 of 3. If you miss, you pay the $50 fine and move."),
    ).toBeInTheDocument();
  });
});

describe("TurnArea: awaiting_end_turn", () => {
  test("shows Next turn and sends EndTurn", async () => {
    const { send } = renderTurn({ phase: "awaiting_end_turn", turn: { dice: [3, 4] } });
    expect(screen.getByRole("img", { name: "Dice: 3 and 4" })).toBeInTheDocument();
    expect(phaseButtons()).toEqual(["Next turn"]);
    await userEvent.click(screen.getByRole("button", { name: "Next turn" }));
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: "EndTurn" }, { seatId: a.id });
  });

  test("says that doubles which freed the player from jail give no extra roll", () => {
    renderTurn({ phase: "awaiting_end_turn", turn: { dice: [3, 3], doubles: 0 } });
    expect(
      screen.getByText("Doubles that free you from jail give no extra roll."),
    ).toBeInTheDocument();
    expect(phaseButtons()).toEqual(["Next turn"]);
  });
});

describe("TurnArea: a device that may not act", () => {
  const cases: [string, Setup][] = [
    ["awaiting_roll", { phase: "awaiting_roll", current: "b" }],
    [
      "awaiting_buy_decision",
      { phase: "awaiting_buy_decision", current: "b", player: { position: 1, cash: 500 } },
    ],
    [
      "awaiting_jail_choice",
      {
        phase: "awaiting_jail_choice",
        current: "b",
        player: { inJail: true, position: 10, heldJailCards: ["chest"] },
      },
    ],
    ["awaiting_end_turn", { phase: "awaiting_end_turn", current: "b", turn: { dice: [1, 2] } }],
  ];

  test.each(cases)("%s: shows the phase read-only with Waiting for <name>", (_phase, setup) => {
    const { send } = renderTurn(setup, fx.ownerId);
    expect(screen.getByText("Waiting for Bo")).toBeInTheDocument();
    expect(buttonNames()).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  test("keeps the title deed of the property for sale in view", () => {
    renderTurn(
      { phase: "awaiting_buy_decision", current: "b", player: { position: 1, cash: 500 } },
      fx.ownerId,
    );
    expect(screen.getByText("Driftwood Lane is for sale")).toBeInTheDocument();
  });

  test("the guest device watches the turn of a hot-seat seat of the owner", () => {
    renderTurn({ phase: "awaiting_roll", current: "c" }, fx.guestId);
    expect(screen.getByText("Waiting for Cy")).toBeInTheDocument();
    expect(buttonNames()).toEqual([]);
  });

  test("a user with no seat in the game watches", () => {
    renderTurn({ phase: "awaiting_roll", current: "a" }, crypto.randomUUID());
    expect(screen.getByText("Waiting for Ann")).toBeInTheDocument();
    expect(buttonNames()).toEqual([]);
  });

  test("the guest sends its own seat on its own turn", async () => {
    const { send } = renderTurn({ phase: "awaiting_roll", current: "b" }, fx.guestId);
    await userEvent.click(screen.getByRole("button", { name: "Roll" }));
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: "RollDice" }, { seatId: b.id });
  });
});

describe("TurnArea: pending and errors", () => {
  test("disables every button while an action is pending", async () => {
    const { send } = renderTurn(
      {
        phase: "awaiting_jail_choice",
        player: { inJail: true, cash: 500, heldJailCards: ["chest"] },
      },
      fx.ownerId,
      { pending: true },
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
    for (const button of buttons) expect(button).toBeDisabled();
    await userEvent.click(buttons[0] as HTMLElement);
    expect(send).not.toHaveBeenCalled();
    expect(document.querySelector(".turn-area")).toHaveAttribute("aria-busy", "true");
  });

  test("enables the buttons again when the action settles", () => {
    const view = renderTurn({ phase: "awaiting_roll" }, fx.ownerId, { pending: true });
    expect(screen.getByRole("button", { name: "Roll" })).toBeDisabled();
    view.update({ pending: false });
    expect(screen.getByRole("button", { name: "Roll" })).toBeEnabled();
  });

  test("shows a rejected action in a live region and dismisses it", async () => {
    const error = new ApiError(422, "wrong_phase", "The action is not allowed in this phase");
    const view = renderTurn({ phase: "awaiting_roll" }, fx.ownerId, { error });
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(within(region).getByText("The action is not allowed in this phase")).toBeInTheDocument();
    expect(region.querySelector("[data-code]")).toHaveAttribute("data-code", "wrong_phase");

    await userEvent.click(within(region).getByRole("button", { name: "Dismiss" }));
    expect(region).toBeEmptyDOMElement();

    // The same error stays dismissed on a render, a new error shows again.
    view.update({ error });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    view.update({ error: new ApiError(422, "insufficient_funds", "Not enough cash") });
    expect(screen.getByText("Not enough cash")).toBeInTheDocument();
  });

  test("keeps the live region in the DOM while there is no error", () => {
    renderTurn({ phase: "awaiting_roll" });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  test("a rejected send does not throw", async () => {
    const unhandled = vi.fn<() => void>();
    process.on("unhandledRejection", unhandled);
    const send = vi.fn<GameActions["send"]>(() =>
      Promise.reject(new ApiError(422, "wrong_phase", "no")),
    );
    renderTurn({ phase: "awaiting_roll" }, fx.ownerId, { send });
    await userEvent.click(screen.getByRole("button", { name: "Roll" }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});

describe("TurnArea: Trade button", () => {
  test("opens the trade builder in place of the phase view and closes it again", async () => {
    renderTurn({ phase: "awaiting_roll", current: "a" });
    expect(buttonNames()).toEqual(["Roll", "Trade"]);
    await userEvent.click(screen.getByRole("button", { name: "Trade" }));
    expect(screen.getByRole("heading", { name: "Propose a trade" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Roll" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(buttonNames()).toEqual(["Roll", "Trade"]);
  });

  test("closes the builder when the phase no longer allows a proposal", async () => {
    const { store } = renderTurn({ phase: "awaiting_roll", current: "a" });
    await userEvent.click(screen.getByRole("button", { name: "Trade" }));
    act(() =>
      store.applyStateResponse({
        version: 101,
        state: { ...stateFor({ phase: "awaiting_trade_response", current: "b" }), version: 101 },
      }),
    );
    expect(screen.queryByRole("heading", { name: "Propose a trade" })).not.toBeInTheDocument();
  });

  test("is not offered on a remote turn, while an action is pending, or in a bid", () => {
    const remote = renderTurn({ phase: "awaiting_roll", current: "b" });
    expect(buttonNames()).not.toContain("Trade");
    remote.unmount();
    const pending = renderTurn({ phase: "awaiting_roll", current: "a" }, fx.ownerId, {
      pending: true,
    });
    expect(buttonNames()).not.toContain("Trade");
    pending.unmount();
    renderTurn({ phase: "awaiting_bid", current: "a" });
    expect(buttonNames()).not.toContain("Trade");
  });

  test("is offered in the debt view of the debtor", () => {
    renderTurn({ phase: "awaiting_debt", current: "a" });
    expect(buttonNames()).toContain("Trade");
  });
});

describe("TurnArea: error source", () => {
  const error = new ApiError(409, "wrong_phase", "Not now");

  test("shows an error with no source", () => {
    renderTurn({ phase: "awaiting_roll" }, fx.ownerId, { error });
    expect(screen.getByText("Not now")).toBeInTheDocument();
  });

  test("leaves the error of the hand and the menu to them", () => {
    renderTurn({ phase: "awaiting_roll" }, fx.ownerId, { error, errorSource: "hand" });
    expect(screen.queryByText("Not now")).not.toBeInTheDocument();
  });
});
