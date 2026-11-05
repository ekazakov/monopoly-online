import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Invite, LobbyGame, StreamMessage } from "@monopoly/shared";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { errorReply, gameFixture, mockApi, noContent, userFixture } from "../../testing/fakeApi.ts";
import { FakeRealtimeClient } from "../../testing/fakeRealtime.ts";
import { renderRoute } from "../../testing/render.tsx";

// What the lobby does when an answer to Join, Accept, Decline or Sign out does not go as hoped.
const userTopic = `user:${userFixture.id}` as const;
const target: LobbyGame = {
  id: "00000000-0000-4000-8000-000000000301",
  name: "Game 1",
  ownerName: "Ann",
  status: "waiting",
  seatCount: 2,
  tokens: ["dog", "cat"],
  createdAt: "2026-11-02T10:00:00.000Z",
};
const invite: Invite = {
  id: "00000000-0000-4000-8000-000000000401",
  gameId: target.id,
  gameName: "Game 1",
  hostName: "Ann",
  state: "pending",
  createdAt: new Date().toISOString(),
};
const snapshot: StreamMessage = {
  topic: "lobby",
  type: "lobby.snapshot",
  version: 0,
  payload: { games: [target] },
};
const invites: StreamMessage = {
  topic: userTopic,
  type: "invites.updated",
  version: 0,
  payload: { invites: [invite] },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openLobby(routes: Parameters<typeof mockApi>[0] = {}) {
  const realtime = new FakeRealtimeClient();
  const calls = mockApi({
    "GET /api/me": Response.json({ user: userFixture }),
    "GET /api/me/games": Response.json({ games: [] }),
    ...routes,
  });
  const view = await renderRoute("/", undefined, { realtime });
  await screen.findByRole("heading", { name: "Lobby" });
  act(() => realtime.emit(snapshot));
  act(() => realtime.emit(invites));
  return { ...view, calls, realtime, user: userEvent.setup() };
}

describe("answers that fail", () => {
  test("Decline that fails shows a notice and keeps the invite", async () => {
    const { user } = await openLobby({
      [`POST /api/invites/${invite.id}/decline`]: errorReply(500, "internal_error"),
    });
    await user.click(screen.getByRole("button", { name: "Decline the invite to Game 1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not decline the invite");
    expect(screen.getByText("Ann invited you")).toBeVisible();
  });

  test("Accept into a game where the name is taken shows that notice", async () => {
    const { user, router } = await openLobby({
      [`POST /api/invites/${invite.id}/accept`]: errorReply(409, "seat_name_taken"),
    });
    await user.click(screen.getByRole("button", { name: "Accept the invite to Game 1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your name is taken in this game");
    expect(router.state.location.pathname).toBe("/");
  });

  test("Accept on a game that was cancelled says it is gone", async () => {
    const { user } = await openLobby({
      [`POST /api/invites/${invite.id}/accept`]: errorReply(404, "not_found"),
    });
    await user.click(screen.getByRole("button", { name: "Accept the invite to Game 1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This game is gone");
  });

  test("a new failure replaces the notice, and Dismiss closes it", async () => {
    const { user } = await openLobby({
      [`POST /api/games/${target.id}/join`]: errorReply(500, "internal_error"),
      [`POST /api/invites/${invite.id}/accept`]: errorReply(409, "game_full"),
    });
    await user.click(screen.getByRole("button", { name: "Join Game 1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not join the game");
    await user.click(screen.getByRole("button", { name: "Accept the invite to Game 1" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("This game is full"));
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("the buttons of an invite are disabled while its answer is on its way", async () => {
    let finish: (reply: Response) => void = () => {};
    const { user } = await openLobby({
      [`POST /api/invites/${invite.id}/decline`]: () =>
        new Promise<Response>((resolve) => (finish = resolve)),
    });
    await user.click(screen.getByRole("button", { name: "Decline the invite to Game 1" }));
    expect(screen.getByRole("button", { name: "Decline the invite to Game 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Accept the invite to Game 1" })).toBeDisabled();
    finish(noContent());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Accept the invite to Game 1" })).toBeEnabled(),
    );
  });

  test("the Join buttons are disabled while a join is on its way", async () => {
    let finish: (reply: Response) => void = () => {};
    const { user } = await openLobby({
      [`POST /api/games/${target.id}/join`]: () =>
        new Promise<Response>((resolve) => (finish = resolve)),
    });
    await user.click(screen.getByRole("button", { name: "Join Game 1" }));
    expect(screen.getByRole("button", { name: "Join Game 1" })).toBeDisabled();
    finish(Response.json({ game: { ...gameFixture(), id: target.id } }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Join Game 1" })).toBeNull());
  });
});

describe("sign out", () => {
  test("goes to the sign-in screen", async () => {
    const { user, router } = await openLobby({ "DELETE /api/session": noContent() });
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/sign-in"));
  });

  test("a failure shows a message and stays", async () => {
    const { user, router } = await openLobby({
      "DELETE /api/session": errorReply(500, "internal_error"),
    });
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByText("Could not sign out. Try again.")).toBeVisible();
    expect(router.state.location.pathname).toBe("/");
  });
});

describe("the subscriptions of the lobby", () => {
  test("end when the screen is left", async () => {
    const { realtime, router } = await openLobby();
    expect(realtime.subscribed("lobby")).toBe(true);
    expect(realtime.subscribed(userTopic)).toBe(true);
    await router.navigate({ to: "/games/$gameId", params: { gameId: target.id } });
    await waitFor(() => expect(realtime.subscribed("lobby")).toBe(false));
    expect(realtime.subscribed(userTopic)).toBe(false);
  });
});
