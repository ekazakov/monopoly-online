import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RedactedGameState } from "@monopoly/shared";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { ApiError } from "../../../../api.ts";
import { GameActionsContext } from "../../../../game/actions.ts";
import type { GameActions } from "../../../../game/actions.ts";
import { recordFixture, redact, snapshotMessage, withStatus } from "../../../../game/fixtures.ts";
import { GameStoreProvider } from "../../../../game/GameStoreProvider.tsx";
import { createGameStore } from "../../../../game/store.ts";
import { errorReply, mockApi } from "../../../../testing/fakeApi.ts";
import { LeaveGameMenu, consequenceText } from "./index.ts";

const fx = recordFixture(1);
const { a, b, c } = fx.seats;
// Ann is on turn, so the engine start state (a random first player) is moved to her.
const raw = redact(fx.start);
const start: RedactedGameState = { ...raw, turn: { ...raw.turn, currentPlayerId: a.id } };

const withPlayers = (
  state: RedactedGameState,
  fields: (id: string) => Partial<RedactedGameState["players"][number]>,
): RedactedGameState => ({
  ...state,
  players: state.players.map((p) => ({ ...p, ...fields(p.id) })),
});

interface Options {
  userId?: string;
  state?: RedactedGameState | null;
  actions?: Partial<GameActions>;
}

function setup({ userId = fx.ownerId, state = start, actions: over = {} }: Options = {}) {
  const store = createGameStore();
  act(() => store.applyStreamMessage(snapshotMessage(fx.game, state)));
  const send = vi.fn<GameActions["send"]>(() => Promise.resolve());
  const onLeft = vi.fn<() => void>();
  const actions: GameActions = { send, pending: false, error: null, ...over };
  const tree = (value: GameActions) => (
    <GameStoreProvider store={store}>
      <GameActionsContext value={value}>
        <LeaveGameMenu userId={userId} onLeft={onLeft} />
      </GameActionsContext>
    </GameStoreProvider>
  );
  const view = render(tree(actions));
  return { ...view, store, send, onLeft };
}

const menuButton = () => screen.getByRole("button", { name: "Menu" });

async function openConfirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(menuButton());
  await user.click(screen.getByRole("button", { name: "Leave game" }));
}

describe("LeaveGameMenu: panel", () => {
  test("renders one root element and a closed Menu button", () => {
    const { container } = setup();
    expect(container.children).toHaveLength(1);
    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Leave game" })).not.toBeInTheDocument();
  });

  test("opens in place, not as a dialog, and the button toggles it", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(menuButton());
    expect(menuButton()).toHaveAttribute("aria-expanded", "true");
    expect(menuButton()).toHaveAttribute("aria-controls");
    expect(screen.getByRole("button", { name: "Leave game" })).toHaveFocus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(menuButton());
    expect(screen.queryByRole("button", { name: "Leave game" })).not.toBeInTheDocument();
  });

  test("Escape closes the panel and returns the focus to the Menu button", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(menuButton());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Leave game" })).not.toBeInTheDocument();
    expect(menuButton()).toHaveFocus();
    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
  });

  test("Escape closes the confirmation too", async () => {
    const user = userEvent.setup();
    const { send } = setup({ userId: fx.guestId });
    await openConfirm(user);
    expect(screen.getByRole("heading", { name: "Leave game?" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("heading", { name: "Leave game?" })).not.toBeInTheDocument();
    expect(menuButton()).toHaveFocus();
    expect(send).not.toHaveBeenCalled();
  });

  test("a click outside closes the panel", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(menuButton());
    await user.click(document.body);
    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
  });
});

describe("LeaveGameMenu: one seat", () => {
  test("asks for confirmation with the consequence, and sends nothing before Resign", async () => {
    const user = userEvent.setup();
    const { send } = setup({ userId: fx.guestId });
    await openConfirm(user);
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByText(/^Bo resigns\./)).toHaveTextContent(
      "Bo resigns. Their properties go to the player they owe, or to the bank for auction. The game goes on for the other players.",
    );
    expect(screen.getByText(/This can't be undone/)).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
  });

  test("Resign sends the exact payload for the seat and then calls onLeft", async () => {
    const user = userEvent.setup();
    const { send, onLeft } = setup({ userId: fx.guestId });
    await openConfirm(user);
    await user.click(screen.getByRole("button", { name: "Resign" }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ type: "Resign" }, { seatId: b.id, source: "menu" });
    expect(onLeft).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("heading", { name: "Leave game?" })).not.toBeInTheDocument();
  });

  test("Stay goes back to the menu and sends nothing", async () => {
    const user = userEvent.setup();
    const { send, onLeft } = setup({ userId: fx.guestId });
    await openConfirm(user);
    await user.click(screen.getByRole("button", { name: "Stay" }));
    expect(screen.getByRole("button", { name: "Leave game" })).toHaveFocus();
    expect(send).not.toHaveBeenCalled();
    expect(onLeft).not.toHaveBeenCalled();
  });

  test("says the game ends when only two players are active", async () => {
    const user = userEvent.setup();
    setup({ userId: fx.guestId, state: withPlayers(start, (id) => ({ active: id !== c.id })) });
    await openConfirm(user);
    expect(screen.getByText(/Only one player is left, so the game ends\./)).toBeInTheDocument();
  });
});

describe("LeaveGameMenu: shared device", () => {
  const radioNames = () =>
    screen
      .getAllByRole("radio")
      .map((radio) => (radio as HTMLInputElement).labels?.[0]?.textContent);

  test("lists the active seats of the device as radios, with the acting seat picked", async () => {
    const user = userEvent.setup();
    setup();
    expect(start.turn.currentPlayerId).toBe(a.id);
    await openConfirm(user);
    expect(screen.getByRole("group", { name: /Choose who resigns/ })).toBeInTheDocument();
    expect(radioNames()).toEqual(["Ann✓", "Cy✓"]);
    expect(screen.getByRole("radio", { name: "Ann" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Cy" })).not.toBeChecked();
    // The seat of the other device is not offered.
    expect(screen.queryByRole("radio", { name: /Bo/ })).not.toBeInTheDocument();
  });

  test("sends Resign for the picked seat", async () => {
    const user = userEvent.setup();
    const { send } = setup();
    await openConfirm(user);
    await user.click(screen.getByRole("radio", { name: "Cy" }));
    expect(screen.getByText(/^Cy resigns\./)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resign" }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ type: "Resign" }, { seatId: c.id, source: "menu" });
  });

  test("sends Resign for the acting seat when it stays picked", async () => {
    const user = userEvent.setup();
    const { send } = setup();
    await openConfirm(user);
    await user.click(screen.getByRole("button", { name: "Resign" }));
    expect(send).toHaveBeenCalledWith({ type: "Resign" }, { seatId: a.id, source: "menu" });
  });

  test("with no acting seat on this device, nothing is picked and Resign stays disabled", async () => {
    const user = userEvent.setup();
    const onB: RedactedGameState = { ...start, turn: { ...start.turn, currentPlayerId: b.id } };
    const { send } = setup({ state: onB });
    await openConfirm(user);
    expect(
      screen.getAllByRole("radio").every((radio) => !(radio as HTMLInputElement).checked),
    ).toBe(true);
    expect(screen.getByRole("button", { name: "Resign" })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "Ann" }));
    expect(screen.getByRole("button", { name: "Resign" })).toBeEnabled();
    expect(send).not.toHaveBeenCalled();
  });

  test("calls onLeft only after the last seat of the device resigned", async () => {
    const user = userEvent.setup();
    const { send, onLeft, store } = setup();
    await openConfirm(user);
    await user.click(screen.getByRole("button", { name: "Resign" }));
    expect(onLeft).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Ann resigned.");
    expect(screen.getByRole("button", { name: "Leave game" })).toHaveFocus();

    // The server state now has Ann out of the game.
    act(() =>
      store.applyStateResponse({
        version: 5,
        state: { ...withPlayers(start, (id) => ({ active: id !== a.id })), version: 5 },
      }),
    );
    await user.click(screen.getByRole("button", { name: "Leave game" }));
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByText(/^Cy resigns\./)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resign" }));
    expect(send).toHaveBeenNthCalledWith(1, { type: "Resign" }, { seatId: a.id, source: "menu" });
    expect(send).toHaveBeenNthCalledWith(2, { type: "Resign" }, { seatId: c.id, source: "menu" });
    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  test("does not offer a seat that is already out of the game", async () => {
    const user = userEvent.setup();
    const { send } = setup({ state: withPlayers(start, (id) => ({ active: id !== c.id })) });
    await openConfirm(user);
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByText(/^Ann resigns\./)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resign" }));
    expect(send).toHaveBeenCalledWith({ type: "Resign" }, { seatId: a.id, source: "menu" });
  });
});

describe("LeaveGameMenu: pending and errors", () => {
  test("disables the buttons and announces the pending Resign", async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    const send = vi.fn<GameActions["send"]>(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    const { onLeft } = setup({ userId: fx.guestId, actions: { send } });
    await openConfirm(user);
    await user.click(screen.getByRole("button", { name: "Resign" }));
    expect(screen.getByRole("status")).toHaveTextContent("Resigning…");
    expect(screen.getByRole("button", { name: "Resign" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Stay" })).toBeDisabled();
    expect(onLeft).not.toHaveBeenCalled();
    await act(async () => release());
    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  test("keeps the buttons disabled while the context has an action pending", async () => {
    const user = userEvent.setup();
    const { send } = setup({ userId: fx.guestId, actions: { pending: true } });
    await openConfirm(user);
    expect(screen.getByRole("button", { name: "Resign" })).toBeDisabled();
    expect(send).not.toHaveBeenCalled();
  });

  test("shows the error of a rejected Resign, keeps the panel and allows a retry", async () => {
    const user = userEvent.setup();
    const reject = new ApiError(409, "auction_running", "Wait for the auction to end");
    const send = vi
      .fn<GameActions["send"]>()
      .mockRejectedValueOnce(reject)
      .mockResolvedValueOnce(undefined);
    const { onLeft } = setup({ userId: fx.guestId, actions: { send } });
    await openConfirm(user);
    await user.click(screen.getByRole("button", { name: "Resign" }));
    expect(screen.getByRole("status")).toHaveTextContent("Wait for the auction to end");
    expect(onLeft).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Resign" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Resign" }));
    expect(send).toHaveBeenCalledTimes(2);
    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  test("does not show an old error of the context", async () => {
    const user = userEvent.setup();
    setup({
      userId: fx.guestId,
      actions: { error: new ApiError(409, "wrong_phase", "Not your turn") },
    });
    await openConfirm(user);
    expect(screen.queryByText("Not your turn")).not.toBeInTheDocument();
  });

  test("blocks Resign while an auction runs and says why", async () => {
    const user = userEvent.setup();
    const auctionState: RedactedGameState = {
      ...start,
      turn: { ...start.turn, phase: "awaiting_bid" },
      auction: {
        square: 1,
        bidderOrder: [a.id, b.id, c.id],
        passed: [],
        highBid: 0,
        highBidderId: null,
        actorId: b.id,
        then: "finish_roll",
        queue: [],
        returnPhase: "awaiting_end_turn",
      },
    };
    const { send } = setup({ userId: fx.guestId, state: auctionState });
    await openConfirm(user);
    const resign = screen.getByRole("button", { name: "Resign" });
    expect(resign).toBeDisabled();
    expect(resign).toHaveAccessibleDescription(/Wait for the auction to end/);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("LeaveGameMenu: a device with no seat in play", () => {
  test("a finished game offers Leave without sending anything", async () => {
    const user = userEvent.setup();
    const over = { ...start, turn: { ...start.turn, phase: "game_over" } } as RedactedGameState;
    const { send, onLeft } = setup({ state: over });
    await openConfirm(user);
    expect(screen.getByText(/The game is over\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resign" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Leave" }));
    expect(send).not.toHaveBeenCalled();
    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  test("a user with no seat can leave", async () => {
    const user = userEvent.setup();
    const { send, onLeft } = setup({ userId: crypto.randomUUID() });
    await openConfirm(user);
    expect(screen.getByText(/You are not playing/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Leave" }));
    expect(send).not.toHaveBeenCalled();
    expect(onLeft).toHaveBeenCalledTimes(1);
  });
});

describe("consequenceText", () => {
  test("names the player, or says the chosen player, and tells how the game goes on", () => {
    expect(consequenceText("Ann", 4)).toBe(
      "Ann resigns. Their properties go to the player they owe, or to the bank for auction. The game goes on for the other players.",
    );
    expect(consequenceText(null, 2)).toMatch(/^The chosen player resigns\..*the game ends\.$/);
  });
});

describe("LeaveGameMenu: owner controls", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const savePath = `/api/games/${fx.game.id}/save`;
  const finishPath = `/api/games/${fx.game.id}/finish`;
  const reply = (status: "saved" | "finished") =>
    Response.json({ game: withStatus(fx.game, status) });

  const saveButton = () => screen.getByRole("button", { name: "Save and exit" });
  const finishButton = () => screen.getByRole("button", { name: "Finish game" });

  /** The game of the owner, in the given status. */
  function setupGame(status: "active" | "saved" | "finished", userId = fx.ownerId) {
    const game = withStatus(fx.game, status);
    const store = createGameStore();
    act(() => store.applyStreamMessage(snapshotMessage(game, start)));
    const actions: GameActions = {
      send: vi.fn<GameActions["send"]>(() => Promise.resolve()),
      pending: false,
      error: null,
    };
    return render(
      <GameStoreProvider store={store}>
        <GameActionsContext value={actions}>
          <LeaveGameMenu userId={userId} />
        </GameActionsContext>
      </GameStoreProvider>,
    );
  }

  test("the owner of a running game has Save and exit and Finish game above Leave game", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(menuButton());
    const names = screen
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(names).toEqual(["Menu", "Save and exit", "Finish game", "Leave game"]);
  });

  test("a guest has neither", async () => {
    const user = userEvent.setup();
    setup({ userId: fx.guestId });
    await user.click(menuButton());
    expect(screen.queryByRole("button", { name: "Save and exit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finish game" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leave game" })).toBeInTheDocument();
  });

  test.each(["saved", "finished"] as const)("a %s game has neither", async (status) => {
    const user = userEvent.setup();
    setupGame(status);
    await user.click(menuButton());
    expect(screen.queryByRole("button", { name: "Save and exit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finish game" })).not.toBeInTheDocument();
  });

  test("Save asks first, names the player on turn, and calls nothing before the confirm", async () => {
    const user = userEvent.setup();
    const calls = mockApi({});
    setup();
    await user.click(menuButton());
    await user.click(saveButton());

    expect(screen.getByRole("heading", { name: "Save and exit?" })).toHaveFocus();
    expect(screen.getByText("The game goes back to the start of Ann's turn.")).toBeInTheDocument();
    expect(screen.getByText(/The dice and cards stay the same/)).toBeInTheDocument();
    expect(calls).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Keep playing" }));
    expect(screen.getByRole("button", { name: "Save and exit" })).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  test("Save and exit calls the save route once and closes the panel", async () => {
    const user = userEvent.setup();
    const calls = mockApi({ [`POST ${savePath}`]: reply("saved") });
    setup();
    await user.click(menuButton());
    await user.click(saveButton());
    await user.click(screen.getByRole("button", { name: "Save and exit" }));

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([`POST ${savePath}`]);
    expect(screen.queryByRole("heading", { name: "Save and exit?" })).not.toBeInTheDocument();
    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
  });

  test("Finish says there is no winner, and Finish game calls the finish route", async () => {
    const user = userEvent.setup();
    const calls = mockApi({ [`POST ${finishPath}`]: reply("finished") });
    setup();
    await user.click(menuButton());
    await user.click(finishButton());

    expect(screen.getByRole("heading", { name: "Finish this game?" })).toHaveFocus();
    expect(screen.getByText(/^There is no winner\. The game goes back/)).toBeInTheDocument();
    expect(screen.getByText(/You cannot undo this/)).toBeInTheDocument();
    expect(calls).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Finish game" }));
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([`POST ${finishPath}`]);
    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
  });

  test("a refused save shows the message and keeps the confirm open", async () => {
    const user = userEvent.setup();
    mockApi({ [`POST ${savePath}`]: errorReply(409, "game_not_active", "The game is not active") });
    setup();
    await user.click(menuButton());
    await user.click(saveButton());
    await user.click(screen.getByRole("button", { name: "Save and exit" }));

    expect(await screen.findByRole("status")).toHaveTextContent("The game is not active");
    expect(screen.getByRole("heading", { name: "Save and exit?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save and exit" })).toBeEnabled();
  });

  test("while it waits for the server the buttons are off and the status says so", async () => {
    const user = userEvent.setup();
    let release: (value: Response) => void = () => {};
    mockApi({
      [`POST ${finishPath}`]: new Promise<Response>((resolve) => {
        release = resolve;
      }),
    });
    setup();
    await user.click(menuButton());
    await user.click(finishButton());
    await user.click(screen.getByRole("button", { name: "Finish game" }));

    expect(screen.getByRole("status")).toHaveTextContent("Finishing…");
    expect(screen.getByRole("button", { name: "Keep playing" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Finish game" })).toBeDisabled();

    await act(async () => release(reply("finished")));
    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
  });

  test("Escape closes the Save confirm and sends nothing", async () => {
    const user = userEvent.setup();
    const calls = mockApi({});
    setup();
    await user.click(menuButton());
    await user.click(saveButton());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("heading", { name: "Save and exit?" })).not.toBeInTheDocument();
    expect(menuButton()).toHaveFocus();
    expect(calls).toEqual([]);
  });
});
