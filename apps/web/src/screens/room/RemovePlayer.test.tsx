import { TOKENS } from "@monopoly/shared";
import type { Game, Seat, StreamMessage } from "@monopoly/shared";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vite-plus/test";
import { roomMessage } from "../../game/fixtures.ts";
import { sessionKey } from "../../session/index.ts";
import { errorReply, gameFixture, mockApi, userFixture } from "../../testing/fakeApi.ts";
import { FakeRealtimeClient } from "../../testing/fakeRealtime.ts";
import { createTestQueryClient, renderRoute } from "../../testing/render.tsx";

const base = gameFixture();
const gameId = base.id;
const me = userFixture.id;
const inesId = "1b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d02";
const gameTopic = `game:${gameId}` as const;
const inesTopic = `user:${inesId}` as const;
const removeUrl = `DELETE /api/games/${gameId}/players/${inesId}`;

const owner = base.seats[0]!;
const ines: Seat = {
  id: "5b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d72",
  order: 2,
  name: "Ines",
  kind: "user",
  userId: inesId,
  controllerUserId: inesId,
  token: TOKENS[1]!,
  claimed: false,
};
const tove: Seat = {
  id: "5b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d73",
  order: 3,
  name: "Tove",
  kind: "hotseat",
  userId: null,
  controllerUserId: inesId,
  token: TOKENS[2]!,
  claimed: false,
};
const room = (seats: Seat[], fields: Partial<Game> = {}) => gameFixture({ seats, ...fields });
const removedMessage: StreamMessage = {
  topic: inesTopic,
  type: "room.removed",
  version: 0,
  payload: { gameId },
};

async function setup(game: Game, userId = me, routes: Parameters<typeof mockApi>[0] = {}) {
  const calls = mockApi({
    "GET /api/me": Response.json({ user: userFixture }),
    [`GET /api/games/${gameId}`]: Response.json({ game }),
    "GET /api/me/games": Response.json({ games: [] }),
    ...routes,
  });
  const realtime = new FakeRealtimeClient();
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(sessionKey, { ...userFixture, id: userId });
  const view = await renderRoute(`/games/${gameId}`, queryClient, { realtime });
  return { ...view, calls, realtime, user: userEvent.setup() };
}

describe("host removes a player", () => {
  test("Remove shows for a joined player, not for the host, a guest or a started game", async () => {
    await setup(room([owner, ines, tove]));
    expect(await screen.findByRole("button", { name: "Remove Ines" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Remove Marlow" })).toBeNull();
    // A hot-seat seat of another device has no Remove of its own: it goes with its player.
    expect(screen.queryByRole("button", { name: "Remove Tove" })).toBeNull();
  });

  test("a guest has no Remove for anyone", async () => {
    await setup(room([owner, ines]), inesId);
    await screen.findByRole("button", { name: "Leave game" });
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
  });

  test("the confirm step opens on Keep, names the hot-seat seats, and Keep closes it", async () => {
    const { user, calls } = await setup(room([owner, ines, tove]));
    await user.click(await screen.findByRole("button", { name: "Remove Ines" }));
    const group = screen.getByRole("group", { name: /Remove Ines from this game\?/ });
    expect(within(group).getByText(/Ines can join again with the game link/)).toBeVisible();
    expect(within(group).getByText(/Tove on their device go too/)).toBeVisible();
    expect(within(group).getByRole("button", { name: "Keep" })).toHaveFocus();

    await user.click(within(group).getByRole("button", { name: "Keep" }));
    expect(screen.queryByRole("group", { name: /Remove Ines/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove Ines" })).toHaveFocus();
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
  });

  test("Remove calls the API and the room shows the new seats", async () => {
    const { user, calls } = await setup(room([owner, ines, tove]), me, {
      [removeUrl]: Response.json({ game: room([owner]) }),
    });
    await user.click(await screen.findByRole("button", { name: "Remove Ines" }));
    const group = screen.getByRole("group", { name: /Remove Ines/ });
    await user.click(within(group).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(screen.queryByText("Ines")).toBeNull());
    expect(screen.getByText("1 of 6 seats")).toBeVisible();
    expect(calls.some((c) => c.method === "DELETE" && c.path.endsWith(`/players/${inesId}`))).toBe(
      true,
    );
  });

  test("the button shows Removing while the request runs, and a second click does nothing", async () => {
    let release: (res: Response) => void = () => {};
    const { user, calls } = await setup(room([owner, ines]), me, {
      [removeUrl]: () => new Promise<Response>((resolve) => (release = resolve)),
    });
    await user.click(await screen.findByRole("button", { name: "Remove Ines" }));
    await user.click(screen.getByRole("button", { name: "Remove" }));
    const busy = await screen.findByRole("button", { name: "Removing" });
    expect(busy).toHaveAttribute("aria-busy", "true");
    await user.click(busy);
    expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(1);
    act(() => release(Response.json({ game: room([owner]) })));
    await waitFor(() => expect(screen.queryByText("Ines")).toBeNull());
  });

  test.each([
    [404, "not_found", "This player is already gone."],
    [409, "game_not_waiting", "This game has already started."],
    [403, "not_game_owner", "Only the host can do that."],
    [500, "internal_error", "That did not work. Check the connection and try again."],
  ])("a %i %s shows its message", async (status, code, text) => {
    const { user } = await setup(room([owner, ines]), me, {
      [removeUrl]: errorReply(status, code),
    });
    await user.click(await screen.findByRole("button", { name: "Remove Ines" }));
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
  });
});

describe("the removed player", () => {
  test("room.removed shows the notice, drops both topics and links back to the lobby", async () => {
    const { realtime, user, router } = await setup(room([owner, ines, tove]), inesId);
    await screen.findByRole("button", { name: "Leave game" });
    expect(realtime.subscribed(gameTopic)).toBe(true);
    expect(realtime.subscribed(inesTopic)).toBe(true);

    act(() => realtime.emit(removedMessage));

    expect(await screen.findByRole("heading", { name: "Marlow removed you" })).toHaveFocus();
    expect(screen.getByText(/or this one again with its link/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Leave game" })).toBeNull();
    expect(realtime.subscribed(gameTopic)).toBe(false);
    expect(realtime.subscribed(inesTopic)).toBe(false);

    await user.click(screen.getByRole("link", { name: "Back to lobby" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  test("the room.updated before room.removed does not flash a Join button", async () => {
    const { realtime } = await setup(room([owner, ines]), inesId);
    await screen.findByRole("button", { name: "Leave game" });

    act(() => realtime.emit(roomMessage(room([owner]))));
    expect(screen.queryByRole("button", { name: "Join game" })).toBeNull();
    expect(screen.getByRole("button", { name: "Leave game" })).toBeVisible();

    act(() => realtime.emit(removedMessage));
    expect(await screen.findByRole("heading", { name: "Marlow removed you" })).toBeVisible();
  });

  test("a room.removed for another game is ignored", async () => {
    const { realtime } = await setup(room([owner, ines]), inesId);
    await screen.findByRole("button", { name: "Leave game" });
    act(() =>
      realtime.emit({
        ...removedMessage,
        payload: { gameId: "9b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d09" },
      }),
    );
    expect(screen.getByRole("button", { name: "Leave game" })).toBeVisible();
  });

  test("a later visit to the link asks the server, so the player can join again", async () => {
    let seated = true;
    const { realtime, router } = await setup(room([owner, ines]), inesId, {
      [`GET /api/games/${gameId}`]: () =>
        Response.json({ game: room(seated ? [owner, ines] : [owner]) }),
    });
    await screen.findByRole("button", { name: "Leave game" });
    seated = false;
    act(() => realtime.emit(removedMessage));
    await screen.findByRole("heading", { name: "Marlow removed you" });

    await act(() => router.navigate({ to: "/" }));
    await act(() => router.navigate({ to: "/games/$gameId", params: { gameId } }));
    expect(await screen.findByRole("button", { name: "Join game" })).toBeVisible();
  });
});
