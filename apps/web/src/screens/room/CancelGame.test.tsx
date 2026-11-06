import { QueryClient } from "@tanstack/react-query";
import { TOKENS } from "@monopoly/shared";
import type { Game, Seat, StreamMessage } from "@monopoly/shared";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { sessionKey } from "../../session/index.ts";
import { errorReply, gameFixture, mockApi, userFixture } from "../../testing/fakeApi.ts";
import { FakeRealtimeClient } from "../../testing/fakeRealtime.ts";
import { renderRoute } from "../../testing/render.tsx";
import { roomKey } from "./queries.ts";

const base = gameFixture();
const gameId = base.id;
const me = userFixture.id;
const otherId = "1b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d02";
const visitorId = "9b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d09";
const cancelUrl = `DELETE /api/games/${gameId}`;
const topic = `game:${gameId}` as const;

const owner = base.seats[0]!;
const ines: Seat = {
  id: "5b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d72",
  order: 2,
  name: "Ines",
  kind: "user",
  userId: otherId,
  controllerUserId: otherId,
  token: TOKENS[1]!,
  claimed: false,
};
const room = (seats: Seat[], fields: Partial<Game> = {}) => gameFixture({ seats, ...fields });
const cancelledMessage: StreamMessage = {
  topic,
  type: "room.cancelled",
  version: 0,
  payload: { gameId },
};

// Keeps unused queries, so a test can see that a cancelled room does not stay in the cache.
const keepingClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });

async function setup(game: Game, userId = me, routes: Parameters<typeof mockApi>[0] = {}) {
  const calls = mockApi({
    "GET /api/me": Response.json({ user: userFixture }),
    [`GET /api/games/${gameId}`]: Response.json({ game }),
    "GET /api/me/games": Response.json({ games: [] }),
    ...routes,
  });
  const realtime = new FakeRealtimeClient();
  const queryClient = keepingClient();
  queryClient.setQueryData(sessionKey, { ...userFixture, id: userId });
  const view = await renderRoute(`/games/${gameId}`, queryClient, { realtime });
  return { ...view, calls, realtime, queryClient, user: userEvent.setup() };
}

const openButton = () => screen.findByRole("button", { name: "Cancel game" });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("who can cancel", () => {
  test("the host of a waiting game", async () => {
    await setup(room([owner]));
    expect(await openButton()).toBeVisible();
  });

  test("not a guest, and not a visitor", async () => {
    await setup(room([owner, ines]), otherId);
    await screen.findByRole("button", { name: "Leave game" });
    expect(screen.queryByRole("button", { name: "Cancel game" })).toBeNull();
  });

  test("not a visitor", async () => {
    await setup(room([owner]), visitorId);
    await screen.findByRole("button", { name: "Join game" });
    expect(screen.queryByRole("button", { name: "Cancel game" })).toBeNull();
  });
});

describe("the confirm step", () => {
  test("opens on Keep game with the question; Keep game closes it with no request", async () => {
    const { user, calls } = await setup(room([owner]));
    await user.click(await openButton());

    const question = "Cancel this game? Everyone leaves, and the link stops working.";
    expect(screen.getByRole("group", { name: question })).toBeVisible();
    const keep = screen.getByRole("button", { name: "Keep game" });
    await waitFor(() => expect(keep).toHaveFocus());

    await user.click(keep);
    const reopened = await openButton();
    await waitFor(() => expect(reopened).toHaveFocus());
    expect(screen.queryByRole("group", { name: question })).toBeNull();
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
  });

  test("Cancel game deletes the game and goes to the lobby", async () => {
    const { user, router, calls, queryClient } = await setup(room([owner, ines]), me, {
      [cancelUrl]: new Response(null, { status: 204 }),
    });
    await user.click(await openButton());
    await user.click(screen.getByRole("button", { name: "Cancel game" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(await screen.findByRole("heading", { name: "Lobby" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Game cancelled" })).toBeNull();
    expect(calls.some((c) => c.method === "DELETE" && c.path === `/api/games/${gameId}`)).toBe(
      true,
    );
    // The cancelled room does not stay in the cache.
    expect(queryClient.getQueryData(roomKey(gameId))).toBeUndefined();
  });

  test("the stream copy of the host's own cancel does not flash the notice", async () => {
    let finish: (reply: Response) => void = () => {};
    const { user, router, realtime } = await setup(room([owner, ines]), me, {
      [cancelUrl]: () => new Promise<Response>((resolve) => (finish = resolve)),
    });
    await user.click(await openButton());
    await user.click(screen.getByRole("button", { name: "Cancel game" }));
    expect(await screen.findByRole("button", { name: "Cancelling" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    // The server sends room.cancelled before the answer of the request arrives.
    act(() => realtime.emit(cancelledMessage));
    expect(screen.queryByRole("heading", { name: "Game cancelled" })).toBeNull();

    finish(new Response(null, { status: 204 }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  test.each([
    [409, "game_not_waiting", "This game has already started."],
    [403, "not_game_owner", "Only the host can do that."],
    [404, "not_found", "This game no longer exists. The host may have cancelled it."],
    [500, "internal_error", "That did not work. Check the connection and try again."],
  ])("a %i %s shows its message and stays in the room", async (status, code, text) => {
    const { user, router } = await setup(room([owner]), me, {
      [cancelUrl]: errorReply(status, code),
    });
    await user.click(await openButton());
    await user.click(screen.getByRole("button", { name: "Cancel game" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(router.state.location.pathname).toBe(`/games/${gameId}`);
  });
});

describe("room.cancelled for the other players", () => {
  test("a guest sees Game cancelled with Back to lobby, and the topic is dropped", async () => {
    const { realtime, user, router } = await setup(room([owner, ines]), otherId);
    await screen.findByRole("button", { name: "Leave game" });
    expect(realtime.subscribed(topic)).toBe(true);

    act(() => realtime.emit(cancelledMessage));

    expect(await screen.findByRole("heading", { name: "Game cancelled" })).toHaveFocus();
    expect(screen.getByText("Marlow cancelled this game before it started.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Leave game" })).toBeNull();
    // Without the drop the EventSource would connect to the deleted game again and again.
    expect(realtime.subscribed(topic)).toBe(false);

    await user.click(screen.getByRole("link", { name: "Back to lobby" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  test("a hot-seat controller who is the only guest sees it too", async () => {
    const { realtime } = await setup(
      room([owner, { ...ines, userId: null, kind: "hotseat" }]),
      otherId,
    );
    await screen.findByRole("button", { name: "Leave game" });
    act(() => realtime.emit(cancelledMessage));
    expect(await screen.findByRole("heading", { name: "Game cancelled" })).toBeVisible();
  });

  test("a later visit to the link shows the not found view, not the old room", async () => {
    let gone = false;
    const { realtime, user, router, queryClient } = await setup(room([owner, ines]), otherId, {
      [`GET /api/games/${gameId}`]: () =>
        gone ? errorReply(404, "not_found") : Response.json({ game: room([owner, ines]) }),
    });
    await screen.findByRole("button", { name: "Leave game" });
    gone = true;
    act(() => realtime.emit(cancelledMessage));
    await screen.findByRole("heading", { name: "Game cancelled" });

    await user.click(screen.getByRole("link", { name: "Back to lobby" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(queryClient.getQueryData(roomKey(gameId))).toBeUndefined();

    await router.navigate({ to: "/games/$gameId", params: { gameId } });
    expect(await screen.findByRole("heading", { name: "Not found" })).toBeVisible();
    expect(screen.queryByText("Ines")).toBeNull();
  });

  test("a visitor has no subscription, so the message does not reach them", async () => {
    const { realtime } = await setup(room([owner]), visitorId);
    await screen.findByRole("button", { name: "Join game" });
    expect(realtime.subscribed(topic)).toBe(false);
  });
});
