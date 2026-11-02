import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { errorReply, gameFixture, mockApi, userFixture } from "../testing/fakeApi.ts";
import { renderRoute } from "../testing/render.tsx";
import { gameIdFromInvite } from "./HomeScreen.tsx";

const game = gameFixture();

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openHome(routes: Parameters<typeof mockApi>[0] = {}) {
  const calls = mockApi({
    "GET /api/me": Response.json({ user: userFixture }),
    [`GET /api/games/${game.id}`]: Response.json({ game }),
    ...routes,
  });
  const view = await renderRoute("/");
  await screen.findByRole("heading", { name: "Home" });
  return { ...view, calls, user: userEvent.setup() };
}

describe("gameIdFromInvite", () => {
  test.each([
    [game.id, game.id],
    [`http://localhost:5173/games/${game.id}`, game.id],
    [`  https://x.test/games/${game.id.toUpperCase()}/ `, game.id],
  ])("finds the id in %s", (text, expected) => {
    expect(gameIdFromInvite(text)).toBe(expected);
  });

  test.each(["", "hello", "/games/123"])("finds nothing in %j", (text) => {
    expect(gameIdFromInvite(text)).toBeNull();
  });
});

describe("create game", () => {
  test("starts with a default name and opens the new room", async () => {
    const { user, router, calls } = await openHome({
      "POST /api/games": Response.json({ game }, { status: 201 }),
    });
    expect(screen.getByLabelText("Game name")).toHaveValue(`${userFixture.name}'s game`);
    await user.clear(screen.getByLabelText("Game name"));
    await user.type(screen.getByLabelText("Game name"), "  Friday game ");
    await user.click(screen.getByRole("button", { name: "Create game" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/games/${game.id}`));
    const post = calls.find((call) => call.method === "POST" && call.path === "/api/games");
    expect(post?.body).toEqual({ name: "Friday game" });
  });

  test("refuses an empty name without a request", async () => {
    const { user, calls } = await openHome();
    await user.clear(screen.getByLabelText("Game name"));
    await user.click(screen.getByRole("button", { name: "Create game" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a name for the game.");
    expect(screen.getByLabelText("Game name")).toHaveAttribute("aria-invalid", "true");
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });

  test("refuses a name over 60 characters", async () => {
    const { user } = await openHome();
    await user.clear(screen.getByLabelText("Game name"));
    await user.click(screen.getByLabelText("Game name"));
    await user.paste("x".repeat(61));
    await user.click(screen.getByRole("button", { name: "Create game" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("60 characters");
  });

  test("shows an error when the server refuses", async () => {
    const { user, router } = await openHome({
      "POST /api/games": errorReply(500, "internal_error"),
    });
    await user.click(screen.getByRole("button", { name: "Create game" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not create the game");
    expect(router.state.location.pathname).toBe("/");
  });
});

describe("join a game", () => {
  test("opens the room from a pasted link", async () => {
    const { user, router } = await openHome();
    await user.type(screen.getByLabelText("Game link"), `http://localhost:5173/games/${game.id}`);
    await user.click(screen.getByRole("button", { name: "Open game" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/games/${game.id}`));
  });

  test("explains a text that is not a link", async () => {
    const { user, router } = await openHome();
    await user.type(screen.getByLabelText("Game link"), "hello");
    await user.click(screen.getByRole("button", { name: "Open game" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not a game link");
    expect(screen.getByLabelText("Game link")).toHaveAttribute("aria-invalid", "true");
    expect(router.state.location.pathname).toBe("/");
  });
});
