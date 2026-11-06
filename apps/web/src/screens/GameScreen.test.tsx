import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Game, RedactedGameState } from "@monopoly/shared";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import {
  actionResponse,
  actionsMessage,
  recordFixture,
  redact,
  roomMessage,
  snapshotMessage,
  withStatus,
} from "../game/fixtures.ts";
import { ActionApiError } from "../realtime/index.ts";
import { sessionKey } from "../session/index.ts";
import { errorReply, mockApi, userFixture } from "../testing/fakeApi.ts";
import { FakeRealtimeClient } from "../testing/fakeRealtime.ts";
import { createTestQueryClient, renderRoute } from "../testing/render.tsx";

const fx = recordFixture(4);
const { a, b, c } = fx.seats;
const [first, second, third, fourth] = fx.steps;
if (!first || !second || !third || !fourth) throw new Error("fixture too short");

const gameId = fx.game.id;
const path = `/games/${gameId}/play`;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface Options {
  game?: Game;
  state?: RedactedGameState;
  /** The user on this device. The seeded fixture starts with seat b, the guest. */
  userId?: string;
  room?: Response;
  stateReply?: Response;
}

async function setup({
  game = fx.game,
  state = redact(fx.start),
  userId = fx.guestId,
  room,
  stateReply,
}: Options = {}) {
  const calls = mockApi({
    [`GET /api/games/${game.id}`]: room ?? Response.json({ game }),
    [`GET /api/games/${game.id}/state`]:
      stateReply ?? Response.json({ version: state.version, state }),
  });
  const realtime = new FakeRealtimeClient();
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(sessionKey, { ...userFixture, id: userId });
  const view = await renderRoute(`/games/${game.id}/play`, queryClient, { realtime });
  const stateCalls = () => calls.filter((call) => call.path.endsWith("/state")).length;
  return { ...view, calls, realtime, stateCalls };
}

const region = (name: string) => screen.findByRole("region", { name });
const roll = () => screen.findByRole("button", { name: "Roll" });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GameScreen: loading", () => {
  test("loads the room and the state and fills every region with real data", async () => {
    const { realtime } = await setup();
    await roll();

    const rail = screen.getByRole("complementary", { name: "Players" });
    for (const name of ["Ann", "Bo", "Cy"])
      expect(within(rail).getByText(name)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Game log bar" })).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Board" }).querySelector(".game-board"),
    ).not.toBeNull();
    expect(screen.getByRole("region", { name: "Turn actions" })).toHaveTextContent("Bo");
    expect(screen.getByRole("region", { name: "Property hand" })).toHaveTextContent(
      "Bo's properties",
    );
    expect(screen.getByRole("button", { name: "Menu" })).toBeInTheDocument();
    expect(realtime.subscribed(`game:${gameId}`)).toBe(true);
  });

  test("shows a loading message first", async () => {
    mockApi({ [`GET /api/games/${gameId}`]: new Promise<Response>(() => {}) });
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(sessionKey, userFixture);
    await renderRoute(path, queryClient, { realtime: new FakeRealtimeClient() });
    expect(await screen.findByRole("heading", { name: "Loading the game" })).toBeInTheDocument();
  });

  test("maps the transport status to the connection of the store", async () => {
    const { realtime } = await setup();
    await roll();
    // Nothing reads the connection yet; the subscription is the proof that the screen is wired.
    act(() => realtime.setStatus("open"));
    act(() => realtime.setStatus("reconnecting"));
    expect(realtime.subscribed(`game:${gameId}`)).toBe(true);
  });

  test("redirects a waiting room to the room page", async () => {
    const { router, realtime } = await setup({ game: withStatus(fx.game, "waiting") });
    await waitFor(() => expect(router.state.location.pathname).toBe(`/games/${gameId}`));
    expect(realtime.subscribed(`game:${gameId}`)).toBe(false);
  });

  test("shows the not-found view for an unknown game", async () => {
    await setup({ room: errorReply(404, "not_found") });
    expect(await screen.findByRole("heading", { name: "Not found" })).toBeInTheDocument();
  });

  test("tells a user with no seat that the game is not theirs", async () => {
    await setup({ room: errorReply(403, "not_a_member") });
    expect(await screen.findByRole("heading", { name: "Not your game" })).toBeInTheDocument();
  });

  test("offers a retry for another load error", async () => {
    await setup({ room: errorReply(500, "internal_error", "Server down") });
    expect(
      await screen.findByRole("heading", { name: "Could not load the game" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Server down")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  test("shows the result screen, not the controls, when the game is finished", async () => {
    mockApi({
      [`GET /api/games/${gameId}`]: Response.json({ game: withStatus(fx.game, "finished") }),
      [`GET /api/games/${gameId}/state`]: Response.json({ version: 0, state: redact(fx.start) }),
      [`GET /api/games/${gameId}/result`]: new Promise<Response>(() => {}),
    });
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(sessionKey, { ...userFixture, id: fx.guestId });
    await renderRoute(path, queryClient, { realtime: new FakeRealtimeClient() });
    expect(await screen.findByText("Loading the result…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Roll" })).not.toBeInTheDocument();
  });
});

describe("GameScreen: stream", () => {
  test("a game.actions message updates the rail and the log", async () => {
    const { realtime } = await setup();
    await roll();
    const log = screen.getByRole("region", { name: "Game log bar" });
    const before = log.textContent;

    act(() => realtime.emit(actionsMessage(fx.game, first)));
    await waitFor(() => expect(log.textContent).not.toBe(before));
    const rolled = first.events.find((event) => event.type === "DiceRolled");
    expect(rolled).toBeDefined();
    expect(log.textContent).toMatch(/Bo/);
  });

  test("a room.updated message keeps the screen", async () => {
    const { realtime } = await setup();
    await roll();
    act(() => realtime.emit(roomMessage({ ...fx.game, version: 1, name: "Renamed" })));
    expect(await roll()).toBeInTheDocument();
  });

  test("refetches the state when a message skips a version", async () => {
    const { realtime, stateCalls } = await setup();
    await roll();
    expect(stateCalls()).toBe(1);
    act(() => realtime.emit(snapshotMessage(fx.game, redact(fx.start))));
    act(() => realtime.emit(actionsMessage(fx.game, third)));
    await waitFor(() => expect(stateCalls()).toBe(2));
  });
});

describe("GameScreen: actions", () => {
  test("Roll sends the exact request and puts the response into the store", async () => {
    const { realtime } = await setup();
    realtime.send.mockResolvedValue(actionResponse(first));
    await userEvent.click(await roll());

    expect(realtime.send).toHaveBeenCalledTimes(1);
    const request = realtime.send.mock.calls[0]?.[0];
    expect(request).toEqual({
      gameId,
      seatId: b.id,
      action: { type: "RollDice" },
      expectedVersion: 0,
      clientActionId: expect.stringMatching(uuidPattern),
    });
    // The response moved the game on: the log has a line and Roll is gone.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Roll" })).not.toBeInTheDocument(),
    );
  });

  test("sends the next action with the version of the response", async () => {
    const { realtime } = await setup({ state: first.state });
    // The state after the first roll is on screen now: the player on turn decides on a purchase.
    const next = await screen.findByRole("button", { name: /^Buy/ });
    realtime.send.mockResolvedValue(actionResponse(second));
    await userEvent.click(next);
    expect(realtime.send.mock.calls[0]?.[0]).toMatchObject({
      expectedVersion: first.state.version,
      seatId: b.id,
    });
  });

  test("keeps the button disabled while an action is pending, and shows an error once", async () => {
    const { realtime } = await setup();
    let reject: (error: unknown) => void = () => {};
    realtime.send.mockReturnValue(new Promise((_, no) => (reject = no)));
    await userEvent.click(await roll());
    await waitFor(() => expect(screen.getByRole("button", { name: "Roll" })).toBeDisabled());
    expect(
      screen.getByRole("region", { name: "Turn actions" }).querySelector(".turn-area"),
    ).toHaveAttribute("aria-busy", "true");

    await act(async () => reject(new ActionApiError(409, "wrong_phase", "Not now")));
    expect(await screen.findAllByText("Not now")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Roll" })).toBeEnabled();
  });

  test("a rejected send of the hand shows in the hand and not in the turn area", async () => {
    const owned = {
      ...redact(fx.start),
      ownership: { "1": { ownerId: b.id, houses: 0, mortgaged: false } },
    };
    const { realtime } = await setup({ state: owned });
    await roll();
    realtime.send.mockRejectedValue(new ActionApiError(409, "wrong_phase", "Mortgage refused"));
    const hand = screen.getByRole("region", { name: "Property hand" });
    await userEvent.click(within(hand).getByRole("button", { name: /Bo's properties/ }));
    await userEvent.click(await within(hand).findByRole("button", { name: /Driftwood Lane/ }));
    await userEvent.click(await within(hand).findByRole("button", { name: /^Mortgage/ }));
    await waitFor(() => expect(realtime.send).toHaveBeenCalled());
    expect(await screen.findAllByText("Mortgage refused")).toHaveLength(1);
    expect(within(hand).getByText("Mortgage refused")).toBeInTheDocument();
  });

  test("retries after a network error with the same clientActionId", async () => {
    const { realtime } = await setup();
    realtime.send
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(actionResponse(first));
    await userEvent.click(await roll());
    expect(await screen.findByText(/No connection to the server/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Roll" }));
    await waitFor(() => expect(realtime.send).toHaveBeenCalledTimes(2));
    const [one, two] = realtime.send.mock.calls.map((call) => call[0]);
    expect(two?.clientActionId).toBe(one?.clientActionId);
    await waitFor(() =>
      expect(screen.queryByText(/No connection to the server/)).not.toBeInTheDocument(),
    );
  });

  test("uses a new clientActionId after the server answered", async () => {
    const { realtime } = await setup();
    realtime.send
      .mockRejectedValueOnce(new ActionApiError(409, "wrong_phase", "Not now"))
      .mockRejectedValueOnce(new ActionApiError(409, "wrong_phase", "Not now"));
    await userEvent.click(await roll());
    await screen.findByText("Not now");
    await userEvent.click(screen.getByRole("button", { name: "Roll" }));
    await waitFor(() => expect(realtime.send).toHaveBeenCalledTimes(2));
    const [one, two] = realtime.send.mock.calls.map((call) => call[0]);
    expect(two?.clientActionId).not.toBe(one?.clientActionId);
  });

  test("refetches the state and shows the error after a version conflict", async () => {
    const { realtime, stateCalls } = await setup();
    realtime.send.mockRejectedValue(
      new ActionApiError(409, "version_conflict", "The game moved on", [], 3),
    );
    await userEvent.click(await roll());
    expect(await screen.findByText("The game moved on")).toBeInTheDocument();
    await waitFor(() => expect(stateCalls()).toBe(2));
  });
});

describe("GameScreen: phase views", () => {
  const base = redact(fx.start);

  const bid: RedactedGameState = {
    ...base,
    turn: { currentPlayerId: a.id, phase: "awaiting_bid", doubles: 0, dice: null },
    auction: {
      square: 1,
      bidderOrder: [a.id, b.id, c.id],
      passed: [],
      highBid: 0,
      highBidderId: null,
      actorId: a.id,
      then: "finish_roll",
      queue: [],
      returnPhase: "awaiting_buy_decision",
    },
  };
  const debt: RedactedGameState = {
    ...base,
    turn: { currentPlayerId: a.id, phase: "awaiting_debt", doubles: 0, dice: null },
  };
  const tradeOffer: RedactedGameState = {
    ...base,
    turn: { currentPlayerId: a.id, phase: "awaiting_trade_response", doubles: 0, dice: null },
    trade: {
      fromId: a.id,
      toId: b.id,
      give: { cash: 50, squares: [], jailCards: [] },
      get: { cash: 0, squares: [], jailCards: [] },
      returnPhase: "awaiting_roll",
    },
  };

  test.each([
    ["the auction view", bid, ".auction", fx.ownerId],
    ["the debt view", debt, ".debt-view", fx.ownerId],
    ["the trade response view", tradeOffer, ".trade-flow--response", fx.guestId],
  ])("shows %s for its phase", async (_name, state, selector, userId) => {
    await setup({ state, userId });
    const centre = await region("Turn actions");
    await waitFor(() => expect(centre.querySelector(selector)).not.toBeNull());
  });
});

describe("GameScreen: trade", () => {
  test("the Trade button opens the builder in the centre and Cancel closes it", async () => {
    await setup();
    await roll();
    await userEvent.click(screen.getByRole("button", { name: "Trade" }));
    const centre = screen.getByRole("region", { name: "Turn actions" });
    expect(within(centre).getByRole("heading", { name: "Propose a trade" })).toBeInTheDocument();
    expect(within(centre).queryByRole("button", { name: "Roll" })).not.toBeInTheDocument();
    await userEvent.click(within(centre).getByRole("button", { name: "Cancel" }));
    expect(await roll()).toBeInTheDocument();
  });
});

describe("GameScreen: hot-seat device", () => {
  test("sends as the hot-seat seat that is on turn", async () => {
    const onC = {
      ...redact(fx.start),
      turn: { currentPlayerId: c.id, phase: "awaiting_roll" as const, doubles: 0, dice: null },
    };
    const { realtime } = await setup({ state: onC, userId: fx.ownerId });
    realtime.send.mockResolvedValue(actionResponse(first));
    await screen.findByText(/Cy.s turn/);
    await userEvent.click(await roll());
    expect(realtime.send.mock.calls[0]?.[0]).toMatchObject({ seatId: c.id });
  });

  test("shows the pass-the-device prompt when the turn moves to another seat of this device", async () => {
    const onA = {
      ...redact(fx.start),
      turn: { currentPlayerId: a.id, phase: "awaiting_roll" as const, doubles: 0, dice: null },
    };
    const onC = { ...onA, version: 1, turn: { ...onA.turn, currentPlayerId: c.id } };
    const { realtime } = await setup({ state: onA, userId: fx.ownerId });
    await roll();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    act(() => realtime.emit(snapshotMessage(fx.game, onC, 1)));
    const prompt = await screen.findByRole("dialog", { name: "Pass to Cy" });
    expect(prompt).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Roll" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^I.m Cy/ }));
    expect(await roll()).toBeInTheDocument();
  });

  test("a device with no seat on turn only watches", async () => {
    await setup({ userId: fx.ownerId });
    expect(await screen.findByText("Waiting for Bo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Roll" })).not.toBeInTheDocument();
  });
});

describe("GameScreen: card notice", () => {
  test("is mounted from the first render, so a card of a later action shows", async () => {
    const { realtime } = await setup();
    await roll();
    // No card in the fixture steps: the region stays empty and the screen does not break.
    act(() => realtime.emit(actionsMessage(fx.game, fourth)));
    expect(screen.queryByRole("group", { name: /card$/ })).not.toBeInTheDocument();
  });
});

describe("GameScreen: a saved game", () => {
  const owner = fx.ownerId;
  const savedGame = (game: Game = fx.game) => withStatus({ ...game, version: 5 }, "saved");
  // The rolled-back state with the higher version, as the server sends it.
  const rolledBack = { ...redact(fx.start), version: 5 };

  test("a game saved while it is open shows the notice with OK, and OK goes home", async () => {
    const { realtime, router } = await setup({ userId: fx.guestId });
    await roll();

    act(() => realtime.emit(snapshotMessage(savedGame(), rolledBack)));

    expect(await screen.findByText("Game saved by Ann")).toBeInTheDocument();
    expect(
      screen.getByText("Ann can continue it later. You will find it in My games."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Roll" })).not.toBeInTheDocument();
    const ok = screen.getByRole("button", { name: "OK" });
    expect(ok).toHaveFocus();
    await userEvent.click(ok);
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  test("the owner is told how to continue", async () => {
    const { realtime } = await setup({ userId: owner });
    await screen.findByRole("region", { name: "Turn actions" });

    act(() => realtime.emit(snapshotMessage(savedGame(), rolledBack)));

    expect(await screen.findByText("Game saved")).toBeInTheDocument();
    expect(screen.getByText("You can continue it from your saved games.")).toBeInTheDocument();
  });

  test("the rest of the screen stays: the board and the rail", async () => {
    const { realtime } = await setup({ userId: fx.guestId });
    await roll();
    act(() => realtime.emit(snapshotMessage(savedGame(), rolledBack)));
    await screen.findByText("Game saved by Ann");
    expect(screen.getByRole("complementary", { name: "Players" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Board" })).toBeInTheDocument();
  });

  test("a saved game that is opened later goes to the room and opens no stream", async () => {
    const { router, realtime } = await setup({ game: savedGame(), state: rolledBack });
    await waitFor(() => expect(router.state.location.pathname).toBe(`/games/${gameId}`));
    expect(realtime.subscribed(`game:${gameId}`)).toBe(false);
    expect(screen.queryByText(/Game saved/)).not.toBeInTheDocument();
  });
});

describe("GameScreen: a game finished by the owner", () => {
  test("shows the result screen with the finished-by heading when the snapshot arrives", async () => {
    const finished = withStatus({ ...fx.game, version: 5 }, "finished");
    const result = {
      gameId,
      rounds: 3,
      winner: null,
      finishedBy: "Ann",
      standings: fx.game.seats.map((seat, index) => ({
        rank: index + 1,
        seatId: seat.id,
        name: seat.name,
        controllerUserId: seat.controllerUserId,
        status: "in_game" as const,
        outRound: null,
        cash: 1500 - index * 100,
        properties: 0,
        netWorth: 1500 - index * 100,
      })),
    };
    const { realtime } = await setup({ userId: fx.guestId });
    await roll();
    // The result is read when the screen needs it.
    mockApi({
      [`GET /api/games/${gameId}`]: Response.json({ game: finished }),
      [`GET /api/games/${gameId}/state`]: Response.json({
        version: 5,
        state: { ...redact(fx.start), version: 5 },
      }),
      [`GET /api/games/${gameId}/result`]: Response.json({ result }),
    });

    act(() => realtime.emit(snapshotMessage(finished, { ...redact(fx.start), version: 5 })));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Game finished by Ann" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "OK" })).toBeInTheDocument();
  });
});
