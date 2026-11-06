import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TOKENS } from "@monopoly/shared";
import type { Invite, LobbyGame, StreamMessage } from "@monopoly/shared";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { errorReply, gameFixture, mockApi, noContent, userFixture } from "../../testing/fakeApi.ts";
import { FakeRealtimeClient } from "../../testing/fakeRealtime.ts";
import { renderRoute } from "../../testing/render.tsx";

// The live lists: the open games and the invites come from the `lobby` and `user:<id>` topics.
const game = gameFixture();
const lobbyTopic = "lobby" as const;
const userTopic = `user:${userFixture.id}` as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

const lobbyGame = (n: number, fields: Partial<LobbyGame> = {}): LobbyGame => ({
  id: `00000000-0000-4000-8000-00000000010${n}`,
  name: `Game ${n}`,
  ownerId: "00000000-0000-4000-8000-000000000001",
  ownerName: "Ann",
  status: "waiting",
  seatCount: 2,
  tokens: ["dog", "cat"],
  createdAt: `2026-11-02T10:0${n}:00.000Z`,
  ...fields,
});
const invite = (n: number, fields: Partial<Invite> = {}): Invite => ({
  id: `00000000-0000-4000-8000-00000000020${n}`,
  gameId: lobbyGame(n).id,
  gameName: `Game ${n}`,
  hostName: "Ann",
  state: "pending",
  createdAt: new Date().toISOString(),
  ...fields,
});
const snapshot = (games: LobbyGame[]): StreamMessage => ({
  topic: lobbyTopic,
  type: "lobby.snapshot",
  version: 0,
  payload: { games },
});
const updated = (g: LobbyGame): StreamMessage => ({
  topic: lobbyTopic,
  type: "lobby.updated",
  version: 0,
  payload: { game: g },
});
const removed = (gameId: string): StreamMessage => ({
  topic: lobbyTopic,
  type: "lobby.removed",
  version: 0,
  payload: { gameId },
});
const invitesMsg = (invites: Invite[]): StreamMessage => ({
  topic: userTopic,
  type: "invites.updated",
  version: 0,
  payload: { invites },
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
  const emit = (message: StreamMessage) => act(() => realtime.emit(message));
  return { ...view, calls, realtime, emit, user: userEvent.setup() };
}

const rowsOf = (name: string) =>
  within(screen.getByRole("list", { name })).getAllByRole("listitem");
const namesOf = (name: string) =>
  rowsOf(name).map((row) => within(row).getByText(/^Game \d$/).textContent);
const posted = (calls: { method: string; path: string }[], path: string) =>
  calls.some((c) => c.method === "POST" && c.path === path);

describe("open games", () => {
  test("subscribes to the lobby and to the topic of the user, and says it is loading", async () => {
    const { realtime } = await openLobby();
    expect(realtime.subscribed(lobbyTopic)).toBe(true);
    expect(realtime.subscribed(userTopic)).toBe(true);
    expect(screen.getByText("Loading games…")).toBeInTheDocument();
  });

  test("shows the snapshot, then follows updates and removals, newest first", async () => {
    const { emit } = await openLobby();
    emit(snapshot([lobbyGame(2), lobbyGame(1)]));
    expect(namesOf("Open games")).toEqual(["Game 2", "Game 1"]);
    expect(within(rowsOf("Open games")[0]!).getByLabelText("2 of 6 seats")).toHaveTextContent(
      "2 / 6",
    );

    emit(updated(lobbyGame(3)));
    expect(namesOf("Open games")).toEqual(["Game 3", "Game 2", "Game 1"]);
    emit(updated(lobbyGame(2, { seatCount: 3, tokens: ["dog", "cat", "penguin"] })));
    expect(within(rowsOf("Open games")[1]!).getByLabelText("3 of 6 seats")).toBeInTheDocument();

    emit(removed(lobbyGame(3).id));
    expect(namesOf("Open games")).toEqual(["Game 2", "Game 1"]);
  });

  test("shows the empty state when no game is open", async () => {
    const { emit } = await openLobby();
    emit(snapshot([]));
    expect(screen.getByRole("heading", { name: "No open games" })).toBeInTheDocument();
    expect(
      screen.getByText("Start one and invite friends by name or with a link."),
    ).toBeInTheDocument();
  });

  test("a full game stays in the list with a disabled Full button", async () => {
    const { emit } = await openLobby();
    emit(snapshot([lobbyGame(1, { seatCount: 6, tokens: [...TOKENS] })]));
    expect(screen.getByRole("button", { name: "Full" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^Join/ })).not.toBeInTheDocument();
  });

  test("Join seats the user and opens the room", async () => {
    const target = lobbyGame(1);
    const { emit, user, router, calls } = await openLobby({
      [`POST /api/games/${target.id}/join`]: Response.json({ game: { ...game, id: target.id } }),
    });
    emit(snapshot([target]));
    await user.click(screen.getByRole("button", { name: "Join Game 1" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/games/${target.id}`));
    expect(posted(calls, `/api/games/${target.id}/join`)).toBe(true);
  });

  test("Join on a game that filled meanwhile shows the notice and stays in the lobby", async () => {
    const target = lobbyGame(1);
    const { emit, user, router } = await openLobby({
      [`POST /api/games/${target.id}/join`]: errorReply(409, "game_full"),
    });
    emit(snapshot([target]));
    await user.click(screen.getByRole("button", { name: "Join Game 1" }));
    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent("This game is full");
    expect(notice).toHaveTextContent(
      "The last seat went while you were joining. Pick another game.",
    );
    expect(router.state.location.pathname).toBe("/");
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("a join that finds the user already seated opens the room", async () => {
    const target = lobbyGame(1);
    const { emit, user, router } = await openLobby({
      [`POST /api/games/${target.id}/join`]: errorReply(409, "already_joined"),
    });
    emit(snapshot([target]));
    await user.click(screen.getByRole("button", { name: "Join Game 1" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/games/${target.id}`));
  });

  test("a game of the user in the open list shows Open, not Join", async () => {
    const mine = lobbyGame(1, { ownerName: userFixture.name });
    const { emit } = await openLobby({ "GET /api/me/games": Response.json({ games: [mine] }) });
    await screen.findByRole("list", { name: "My games" });
    emit(snapshot([mine]));
    const open = within(screen.getByRole("list", { name: "Open games" }));
    expect(open.getByRole("button", { name: "Open" })).toBeInTheDocument();
    expect(open.queryByRole("button", { name: /^Join/ })).not.toBeInTheDocument();
  });

  test("tells the user when the stream is reconnecting", async () => {
    const { realtime } = await openLobby();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => realtime.setStatus("reconnecting"));
    expect(screen.getByRole("status")).toHaveTextContent("Reconnecting");
  });
});

describe("my games", () => {
  test("Open for a waiting room, Resume for a game in progress", async () => {
    const waiting = lobbyGame(1, { ownerName: userFixture.name });
    const active = lobbyGame(2, { status: "active", ownerName: "Ann" });
    const { user, router } = await openLobby({
      "GET /api/me/games": Response.json({ games: [active, waiting] }),
    });
    const mine = await screen.findByRole("list", { name: "My games" });
    expect(within(mine).getByText("You are the host", { exact: false })).toBeInTheDocument();
    expect(within(mine).getByText("In progress")).toBeInTheDocument();

    await user.click(within(mine).getByRole("button", { name: "Resume Game 2" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/games/${active.id}/play`));
    await router.navigate({ to: "/" });
    await user.click(await screen.findByRole("button", { name: "Open Game 1" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/games/${waiting.id}`));
  });

  test("says so when the user is in no game", async () => {
    await openLobby();
    expect(await screen.findByText("You are not in a game yet.")).toBeInTheDocument();
  });

  test("a lobby change fetches My games again; a snapshot does not", async () => {
    const { emit, calls } = await openLobby();
    await screen.findByText("You are not in a game yet.");
    const fetches = () => calls.filter((c) => c.path === "/api/me/games").length;
    const before = fetches();
    emit(snapshot([]));
    expect(fetches()).toBe(before);
    emit(removed(lobbyGame(1).id));
    await waitFor(() => expect(fetches()).toBeGreaterThan(before));
  });
});

describe("invites inbox", () => {
  test("shows the invites live; Accept opens the room", async () => {
    const one = invite(1);
    const { emit, user, router, calls } = await openLobby({
      [`POST /api/invites/${one.id}/accept`]: Response.json({ game: { ...game, id: one.gameId } }),
    });
    expect(screen.queryByRole("heading", { name: "Invites" })).not.toBeInTheDocument();
    emit(invitesMsg([one, invite(2)]));
    expect(screen.getByLabelText("2 new invites")).toBeInTheDocument();
    expect(rowsOf("Invites")).toHaveLength(2);
    expect(screen.getAllByText("Ann invited you")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Accept the invite to Game 1" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/games/${one.gameId}`));
    expect(posted(calls, `/api/invites/${one.id}/accept`)).toBe(true);
  });

  test("Decline sends the answer; the inbox follows the next invites message", async () => {
    const one = invite(1);
    const { emit, user, calls } = await openLobby({
      [`POST /api/invites/${one.id}/decline`]: noContent(),
    });
    emit(invitesMsg([one]));
    await user.click(screen.getByRole("button", { name: "Decline the invite to Game 1" }));
    await waitFor(() => expect(posted(calls, `/api/invites/${one.id}/decline`)).toBe(true));
    emit(invitesMsg([]));
    expect(screen.queryByRole("heading", { name: "Invites" })).not.toBeInTheDocument();
  });

  test("Accept on a game that is full shows the notice and keeps the invite", async () => {
    const one = invite(1);
    const { emit, user, router } = await openLobby({
      [`POST /api/invites/${one.id}/accept`]: errorReply(409, "game_full"),
    });
    emit(invitesMsg([one]));
    await user.click(screen.getByRole("button", { name: "Accept the invite to Game 1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This game is full");
    expect(rowsOf("Invites")).toHaveLength(1);
    expect(router.state.location.pathname).toBe("/");
  });
});
