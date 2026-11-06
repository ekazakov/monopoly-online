import { TOKENS } from "@monopoly/shared";
import type { Game, Seat } from "@monopoly/shared";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { roomMessage, snapshotMessage } from "../../game/fixtures.ts";
import { sessionKey } from "../../session/index.ts";
import { errorReply, gameFixture, mockApi, userFixture } from "../../testing/fakeApi.ts";
import { FakeRealtimeClient } from "../../testing/fakeRealtime.ts";
import { createTestQueryClient, renderRoute } from "../../testing/render.tsx";

const base = gameFixture();
const gameId = base.id;
const me = userFixture.id;
const otherId = "1b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d02";

let counter = 0;
function seat(overrides: Partial<Seat>): Seat {
  counter += 1;
  return {
    id: `5b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d${String(30 + counter)}`,
    order: counter,
    name: `Seat${String(counter)}`,
    kind: "user",
    userId: me,
    controllerUserId: me,
    token: TOKENS[(counter - 1) % TOKENS.length]!,
    claimed: false,
    ...overrides,
  };
}

const owner = base.seats[0]!;
const guestSeat = seat({ name: "Ines", userId: otherId, controllerUserId: otherId, order: 1 });
const hotSeat = seat({ name: "Tove", kind: "hotseat", userId: null, order: 2 });

function room(overrides: Partial<Game> = {}): Game {
  return gameFixture(overrides);
}

interface Options {
  game?: Game;
  userId?: string;
  routes?: Parameters<typeof mockApi>[0];
}

async function setup({ game = room(), userId = me, routes = {} }: Options = {}) {
  const calls = mockApi({ [`GET /api/games/${gameId}`]: Response.json({ game }), ...routes });
  const realtime = new FakeRealtimeClient();
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(sessionKey, { ...userFixture, id: userId });
  const view = await renderRoute(`/games/${gameId}`, queryClient, { realtime });
  return { ...view, calls, realtime, user: userEvent.setup() };
}

const button = (name: string) => screen.findByRole("button", { name });
const aliveSeats = () => screen.getAllByRole("listitem");

function stubClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", { value, configurable: true });
}

afterEach(() => {
  vi.unstubAllGlobals();
  stubClipboard(undefined);
});

describe("owner view", () => {
  test("shows seats, tags, open seats, invite link and a disabled Start", async () => {
    await setup();
    expect(await screen.findByRole("heading", { level: 1, name: "Friday game" })).toBeVisible();
    expect(screen.getByText("1 of 6 seats")).toBeVisible();
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(6);
    expect(within(items[0]!).getByText("Host")).toBeVisible();
    expect(within(items[0]!).getByText("You")).toBeVisible();
    expect(screen.getAllByText("Open seat")).toHaveLength(5);
    expect(screen.getByLabelText("Link")).toHaveValue(`${window.location.origin}/games/${gameId}`);
    const start = screen.getByRole("button", { name: "Start game" });
    expect(start).toHaveAttribute("aria-disabled", "true");
    expect(start).toHaveAccessibleDescription("Add at least one more player to start.");
    expect(screen.queryByRole("button", { name: "Leave game" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Join game" })).toBeNull();
  });

  test("Start with 2 seats calls the API and goes to play", async () => {
    const game = room({ seats: [owner, guestSeat] });
    let status: Game["status"] = "waiting";
    const { router, user, calls } = await setup({
      routes: {
        [`GET /api/games/${gameId}`]: () => Response.json({ game: { ...game, status } }),
        [`POST /api/games/${gameId}/start`]: () => {
          status = "active";
          return Response.json({ game: { ...game, status }, state: {} });
        },
      },
    });
    const start = await button("Start game");
    expect(start).not.toHaveAttribute("aria-disabled");
    await user.click(start);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/games/${gameId}/play`));
    expect(calls.some((c) => c.method === "POST" && c.path.endsWith("/start"))).toBe(true);
  });

  test("a disabled Start does not call the API", async () => {
    const { user, calls } = await setup();
    await user.click(await button("Start game"));
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  test("not_enough_players shows a message and reloads the room", async () => {
    const game = room({ seats: [owner, guestSeat] });
    const { user, calls } = await setup({
      game,
      routes: { [`POST /api/games/${gameId}/start`]: errorReply(409, "not_enough_players") },
    });
    await user.click(await button("Start game"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Add at least one more player");
    await waitFor(() =>
      expect(
        calls.filter((c) => c.method === "GET" && c.path === `/api/games/${gameId}`),
      ).toHaveLength(2),
    );
  });

  test("game_not_waiting at Start shows the started notice", async () => {
    const game = room({ seats: [owner, guestSeat] });
    const { user } = await setup({
      game,
      routes: { [`POST /api/games/${gameId}/start`]: errorReply(409, "game_not_waiting") },
    });
    await user.click(await button("Start game"));
    expect(await screen.findByRole("alert")).toHaveTextContent("already started");
  });
});

describe("hot-seat seats", () => {
  test("adds a seat, clears and focuses the field", async () => {
    const after = room({ seats: [owner, hotSeat] });
    const { user, calls } = await setup({
      routes: { [`POST /api/games/${gameId}/seats`]: Response.json({ game: after }) },
    });
    const input = await screen.findByLabelText("Name");
    await user.type(input, "  Tove ");
    await user.click(screen.getByRole("button", { name: "Add seat" }));
    expect(await screen.findByText("Plays on this device")).toBeVisible();
    expect(calls.find((c) => c.path.endsWith("/seats"))?.body).toEqual({ name: "Tove" });
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(screen.getByText("Tove joined")).toBeInTheDocument();
    expect(screen.getByText("2 of 6 seats")).toBeVisible();
  });

  test("checks the name locally", async () => {
    const { user, calls } = await setup();
    const input = await screen.findByLabelText("Name");
    await user.type(input, "T{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Use at least 2 characters.");
    expect(input).toHaveAttribute("aria-invalid", "true");
    await user.clear(input);
    await user.type(input, "x".repeat(17));
    await user.click(screen.getByRole("button", { name: "Add seat" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("16 characters or fewer");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  test.each([
    ["seat_name_taken", "A seat already uses that name"],
    ["game_full", "This game is full."],
  ])("shows %s", async (code, text) => {
    const { user } = await setup({
      routes: { [`POST /api/games/${gameId}/seats`]: errorReply(409, code) },
    });
    const input = await screen.findByLabelText("Name");
    await user.type(input, "Tove{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(input).toHaveValue("Tove");
    expect(input).toHaveFocus();
  });

  test("shows the pending state", async () => {
    let release!: (r: Response) => void;
    const { user } = await setup({
      routes: {
        [`POST /api/games/${gameId}/seats`]: () => new Promise<Response>((r) => (release = r)),
      },
    });
    await user.type(await screen.findByLabelText("Name"), "Tove{Enter}");
    expect(await button("Adding")).toHaveAttribute("aria-busy", "true");
    act(() => release(Response.json({ game: room({ seats: [owner, hotSeat] }) })));
    expect(await button("Add seat")).toBeVisible();
  });

  test("removes only own hot-seat seats", async () => {
    const game = room({ seats: [owner, guestSeat, hotSeat] });
    const { user, calls } = await setup({
      game,
      routes: {
        [`DELETE /api/games/${gameId}/seats/${hotSeat.id}`]: Response.json({
          game: room({ seats: [owner, guestSeat] }),
        }),
      },
    });
    expect(await screen.findAllByRole("button", { name: /^Remove / })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Remove Tove" }));
    await waitFor(() => expect(screen.queryByText("Tove")).toBeNull());
    expect(screen.getByText("Tove left")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
    expect(screen.getByLabelText("Name")).toHaveFocus();
  });

  test("a hot-seat of another guest shows whose device it is", async () => {
    const other = seat({ name: "Ravi", kind: "hotseat", userId: null, controllerUserId: otherId });
    await setup({ game: room({ seats: [owner, guestSeat, other] }) });
    expect(await screen.findByText("Plays on Ines's device")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Remove Ravi" })).toBeNull();
  });

  test("a failed remove shows an error", async () => {
    const game = room({ seats: [owner, hotSeat] });
    const { user } = await setup({
      game,
      routes: { [`DELETE /api/games/${gameId}/seats/${hotSeat.id}`]: errorReply(404, "not_found") },
    });
    await user.click(await button("Remove Tove"));
    expect(await screen.findByRole("alert")).toHaveTextContent("already gone");
  });

  test("a full room has no add form", async () => {
    const seats = [
      owner,
      ...Array.from({ length: 5 }, () => seat({ kind: "hotseat", userId: null })),
    ];
    await setup({ game: room({ seats }) });
    expect(await screen.findByText("All 6 seats are taken.")).toBeVisible();
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.queryByText("Open seat")).toBeNull();
  });
});

describe("invite link", () => {
  test("copies with the clipboard and confirms", async () => {
    const { user } = await setup();
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    await button("Copy");
    stubClipboard({ writeText });
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/games/${gameId}`);
    expect(await screen.findByText(/Link copied/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Copied" })).toBeVisible();
  });

  test("falls back to selecting the link", async () => {
    const { user } = await setup();
    await button("Copy");
    stubClipboard({
      writeText: vi.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error("denied")),
    });
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByText(/The link is selected/)).toBeVisible();
    expect(screen.getByLabelText("Link")).toHaveFocus();
  });

  test("falls back when there is no clipboard", async () => {
    const { user } = await setup();
    await button("Copy");
    stubClipboard(undefined);
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByText(/The link is selected/)).toBeVisible();
  });
});

describe("guest view", () => {
  const guestId = otherId;
  const game = () => room({ seats: [owner, guestSeat, hotSeat] });

  test("shows the waiting text and Leave, no Start", async () => {
    await setup({ game: game(), userId: guestId });
    expect(await screen.findByText("Waiting for Marlow to start")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Start game" })).toBeNull();
    expect(screen.getByRole("button", { name: "Leave game" })).toBeVisible();
    expect(screen.getByText("You")).toBeVisible();
  });

  test("Leave calls the API and goes home", async () => {
    const { user, router, calls } = await setup({
      game: game(),
      userId: guestId,
      routes: { [`POST /api/games/${gameId}/leave`]: Response.json({ game: room() }) },
    });
    await user.click(await button("Leave game"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(calls.some((c) => c.path.endsWith("/leave"))).toBe(true);
  });

  test("a failed leave shows an error", async () => {
    const { user } = await setup({
      game: game(),
      userId: guestId,
      routes: { [`POST /api/games/${gameId}/leave`]: errorReply(409, "game_not_waiting") },
    });
    await user.click(await button("Leave game"));
    expect(await screen.findByRole("alert")).toHaveTextContent("already started");
  });
});

describe("visitor", () => {
  const visitorId = "2b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d03";
  const visit = (routes: Options["routes"] = {}) => setup({ userId: visitorId, routes });

  test("sees the room read-only with Join", async () => {
    const { realtime } = await visit();
    expect(await button("Join game")).toBeVisible();
    expect(screen.queryByLabelText("Link")).toBeNull();
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.queryByRole("button", { name: "Leave game" })).toBeNull();
    expect(realtime.subscribed(`game:${gameId}`)).toBe(false);
  });

  test("join shows the seat and subscribes", async () => {
    const joined = room({
      seats: [owner, seat({ name: "Visitor", userId: visitorId, controllerUserId: visitorId })],
    });
    const { user, realtime } = await visit({
      [`POST /api/games/${gameId}/join`]: Response.json({ game: joined }),
    });
    await user.click(await button("Join game"));
    expect(await screen.findByText("Waiting for Marlow to start")).toBeVisible();
    expect(realtime.subscribed(`game:${gameId}`)).toBe(true);
  });

  test("already_joined reloads the room", async () => {
    const joined = room({
      seats: [owner, seat({ name: "Visitor", userId: visitorId, controllerUserId: visitorId })],
    });
    let reads = 0;
    const { user } = await setup({
      userId: visitorId,
      routes: {
        [`GET /api/games/${gameId}`]: () =>
          Response.json({ game: ++reads === 1 ? room() : joined }),
        [`POST /api/games/${gameId}/join`]: errorReply(409, "already_joined"),
      },
    });
    await user.click(await button("Join game"));
    expect(await screen.findByText("Waiting for Marlow to start")).toBeVisible();
  });

  test.each([
    ["game_full", "This game is full."],
    ["game_not_waiting", "This game has already started."],
    ["seat_name_taken", "Ask the person who controls that seat"],
  ])("join error %s", async (code, text) => {
    const { user } = await visit({ [`POST /api/games/${gameId}/join`]: errorReply(409, code) });
    await user.click(await button("Join game"));
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
  });

  test("an unseated visitor of a started game sees a notice and stays", async () => {
    const { router } = await setup({ userId: visitorId, game: room({ status: "active" }) });
    expect(await screen.findByText("This game has already started.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Join game" })).toBeNull();
    expect(router.state.location.pathname).toBe(`/games/${gameId}`);
  });
});

describe("live updates and navigation", () => {
  test("room.updated replaces the seats", async () => {
    const { realtime } = await setup();
    await screen.findByText("1 of 6 seats");
    act(() => realtime.emit(roomMessage(room({ seats: [owner, guestSeat] }))));
    expect(await screen.findByText("2 of 6 seats")).toBeVisible();
    expect(screen.getByText("Ines joined")).toBeInTheDocument();
    expect(aliveSeats().length).toBeGreaterThan(2);
  });

  test("a snapshot of an active game goes to play", async () => {
    const { realtime, router } = await setup();
    await screen.findByText("1 of 6 seats");
    act(() => realtime.emit(snapshotMessage(room({ status: "active" }), null)));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/games/${gameId}/play`));
  });

  test("a seated user opening an active game goes to play", async () => {
    const { router } = await setup({ game: room({ status: "active" }) });
    await waitFor(() => expect(router.state.location.pathname).toBe(`/games/${gameId}/play`));
  });

  test("shows a notice while the stream reconnects", async () => {
    const { realtime } = await setup();
    await screen.findByText("1 of 6 seats");
    expect(screen.queryByText(/Reconnecting/)).toBeNull();
    act(() => realtime.setStatus("reconnecting"));
    expect(await screen.findByText(/Reconnecting/)).toBeVisible();
    act(() => realtime.setStatus("open"));
    await waitFor(() => expect(screen.queryByText(/Reconnecting/)).toBeNull());
  });
});

describe("load errors", () => {
  test("404 shows not found", async () => {
    mockApi({ [`GET /api/games/${gameId}`]: errorReply(404, "not_found") });
    const queryClient = createTestQueryClient();
    await renderRoute(`/games/${gameId}`, queryClient, { realtime: new FakeRealtimeClient() });
    expect(await screen.findByRole("heading", { name: "Not found" })).toBeVisible();
  });

  test("403 not_a_member shows a message", async () => {
    mockApi({ [`GET /api/games/${gameId}`]: errorReply(403, "not_a_member") });
    await renderRoute(`/games/${gameId}`, undefined, { realtime: new FakeRealtimeClient() });
    expect(await screen.findByRole("heading", { name: "Not your game" })).toBeVisible();
  });

  test("another failure offers a retry", async () => {
    let fail = true;
    mockApi({
      [`GET /api/games/${gameId}`]: () =>
        fail ? errorReply(500, "internal_error", "Boom") : Response.json({ game: room() }),
    });
    await renderRoute(`/games/${gameId}`, undefined, { realtime: new FakeRealtimeClient() });
    const retry = await screen.findByRole("button", { name: "Try again" });
    fail = false;
    retry.click();
    expect(await screen.findByRole("heading", { level: 1, name: "Friday game" })).toBeVisible();
  });
});
