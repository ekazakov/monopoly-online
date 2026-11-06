import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LobbyGame } from "@monopoly/shared";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { errorReply, gameFixture, mockApi, userFixture } from "../../testing/fakeApi.ts";
import { renderRoute } from "../../testing/render.tsx";

// Saved games in the lobby (board SavedGames): the owner continues or finishes them, the others
// see "Saved" in My games and open the room.
const OTHER_USER = "0b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d99";
const saved = (fields: Partial<LobbyGame> = {}): LobbyGame => ({
  id: "00000000-0000-4000-8000-000000000501",
  name: "Marlow's game",
  ownerId: userFixture.id,
  ownerName: userFixture.name,
  status: "saved",
  seatCount: 4,
  tokens: ["dog", "cat", "penguin", "car"],
  createdAt: "2026-11-02T10:00:00.000Z",
  ...fields,
});
const active = saved({
  id: "00000000-0000-4000-8000-000000000502",
  name: "Friday game",
  status: "active",
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openHome(games: LobbyGame[], routes: Parameters<typeof mockApi>[0] = {}) {
  const calls = mockApi({
    "GET /api/me": Response.json({ user: userFixture }),
    "GET /api/me/games": Response.json({ games }),
    ...routes,
  });
  const view = await renderRoute("/");
  await screen.findByRole("heading", { name: "Lobby" });
  return { ...view, calls, user: userEvent.setup() };
}

const group = (name: string) => screen.findByRole("region", { name });

describe("Saved games group (the owner)", () => {
  test("lists the games the user saved, with Saved, the host line and the seats", async () => {
    await openHome([saved(), active]);
    const section = await group("Saved games");
    const row = within(section).getByRole("listitem");
    expect(row).toHaveTextContent("Marlow's game");
    expect(row).toHaveTextContent("Saved");
    expect(row).toHaveTextContent("You are the host · 4 seats");
    expect(within(row).getByRole("button", { name: "Continue Marlow's game" })).toBeEnabled();
    expect(within(row).getByRole("button", { name: "Finish Marlow's game" })).toBeEnabled();
  });

  test("the saved game is not in My games, and a game in progress is", async () => {
    await openHome([saved(), active]);
    await group("Saved games");
    const mine = screen.getByRole("list", { name: "My games" });
    expect(within(mine).getAllByRole("listitem")).toHaveLength(1);
    expect(mine).toHaveTextContent("Friday game");
    expect(mine).not.toHaveTextContent("Marlow's game");
  });

  test("has no group when nothing is saved", async () => {
    await openHome([active]);
    await screen.findByRole("list", { name: "My games" });
    expect(screen.queryByRole("heading", { name: "Saved games" })).not.toBeInTheDocument();
  });

  test("Continue claims the seats and opens the room", async () => {
    const game = saved();
    const { user, calls, router } = await openHome([game], {
      [`POST /api/games/${game.id}/claim`]: Response.json({
        game: gameFixture({ id: game.id, status: "saved" }),
      }),
      [`GET /api/games/${game.id}`]: Response.json({
        game: gameFixture({ id: game.id, status: "saved" }),
      }),
    });
    await user.click(await screen.findByRole("button", { name: "Continue Marlow's game" }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/games/${game.id}`));
    expect(calls.filter((c) => c.method === "POST").map((c) => c.path)).toEqual([
      `/api/games/${game.id}/claim`,
    ]);
  });

  test("a Continue that the server refuses shows a notice and stays", async () => {
    const game = saved();
    const { user, router } = await openHome([game], {
      [`POST /api/games/${game.id}/claim`]: errorReply(409, "game_not_saved"),
    });
    await user.click(await screen.findByRole("button", { name: "Continue Marlow's game" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This game has changed");
    expect(router.state.location.pathname).toBe("/");
  });

  test("Finish asks first, and Keep game puts the buttons back", async () => {
    const game = saved();
    const { user, calls } = await openHome([game]);
    await user.click(await screen.findByRole("button", { name: "Finish Marlow's game" }));

    const confirm = screen.getByRole("group");
    expect(confirm).toHaveTextContent("Finish this game with no winner? You cannot undo this.");
    expect(
      screen.queryByRole("button", { name: "Continue Marlow's game" }),
    ).not.toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "Keep game" }));

    expect(screen.getByRole("button", { name: "Continue Marlow's game" })).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST")).toEqual([]);
  });

  test("Finish game calls the finish route and reads the list again", async () => {
    const game = saved();
    let finished = false;
    const { user, calls } = await openHome([game], {
      [`POST /api/games/${game.id}/finish`]: () => {
        finished = true;
        return Response.json({ game: gameFixture({ id: game.id, status: "finished" }) });
      },
      "GET /api/me/games": () => Response.json({ games: finished ? [] : [game] }),
    });
    await user.click(await screen.findByRole("button", { name: "Finish Marlow's game" }));
    await user.click(screen.getByRole("button", { name: "Finish game" }));

    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Saved games" })).not.toBeInTheDocument(),
    );
    expect(calls.filter((c) => c.method === "POST").map((c) => c.path)).toEqual([
      `/api/games/${game.id}/finish`,
    ]);
  });
});

describe("Saved games of other hosts (My games)", () => {
  const theirs = saved({ ownerId: OTHER_USER, ownerName: "Ines" });

  test("show Saved, the host and Open, with no Continue or Finish", async () => {
    await openHome([theirs]);
    const mine = await screen.findByRole("list", { name: "My games" });
    const row = within(mine).getByRole("listitem");
    expect(row).toHaveTextContent("Saved");
    expect(row).toHaveTextContent("Hosted by Ines · 4 of 6 seats");
    expect(screen.queryByRole("heading", { name: "Saved games" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Continue|Finish/ })).not.toBeInTheDocument();
  });

  test("Open goes to the room, not to the game", async () => {
    const { user, router } = await openHome([theirs], {
      [`GET /api/games/${theirs.id}`]: Response.json({
        game: gameFixture({ id: theirs.id, status: "saved" }),
      }),
    });
    await user.click(await screen.findByRole("button", { name: "Open Marlow's game" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/games/${theirs.id}`));
  });
});
