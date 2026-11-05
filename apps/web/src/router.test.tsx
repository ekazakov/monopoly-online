import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { errorReply, gameFixture, mockApi, userFixture } from "./testing/fakeApi.ts";
import { renderRoute, renderRouteWithServerSession } from "./testing/render.tsx";

const gameId = "7b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d11";

// The guards, redirects and the 401 handler are tested in session/session.test.tsx.
describe("routes with a session", () => {
  beforeEach(() => {
    mockApi({ "GET /api/me": Response.json({ user: userFixture }) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("/ renders home", async () => {
    await renderRoute("/");
    expect(await screen.findByRole("heading", { name: "Lobby" })).toBeInTheDocument();
  });

  test("/sign-in leaves for home", async () => {
    await renderRoute("/sign-in");
    expect(await screen.findByRole("heading", { name: "Lobby" })).toBeInTheDocument();
  });

  test("/games/$gameId renders the room", async () => {
    mockApi({
      "GET /api/me": Response.json({ user: userFixture }),
      [`GET /api/games/${gameId}`]: Response.json({ game: gameFixture() }),
    });
    await renderRoute(`/games/${gameId}`);
    expect(await screen.findByRole("heading", { name: gameFixture().name })).toBeInTheDocument();
  });

  test("/games/$gameId/play sends a waiting room to the room page", async () => {
    mockApi({
      "GET /api/me": Response.json({ user: userFixture }),
      [`GET /api/games/${gameId}`]: Response.json({ game: gameFixture() }),
    });
    await renderRoute(`/games/${gameId}/play`);
    expect(await screen.findByRole("heading", { name: gameFixture().name })).toBeInTheDocument();
  });

  test("an unknown path renders the not-found view", async () => {
    await renderRoute("/no/such/page");
    expect(await screen.findByRole("heading", { name: "Not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
  });
});

describe("routes without a session", () => {
  beforeEach(() => {
    mockApi({ "GET /api/me": errorReply(401, "unauthorized") });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("/sign-in renders the sign-in screen", async () => {
    await renderRouteWithServerSession("/sign-in");
    expect(await screen.findByRole("heading", { name: "Pick a name to play" })).toBeInTheDocument();
  });
});

describe("route errors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("a failed guard shows the error view, and Retry loads the route again", async () => {
    mockApi({ "GET /api/me": errorReply(500, "internal_error", "Server down") });
    await renderRouteWithServerSession("/");
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");

    mockApi({ "GET /api/me": Response.json({ user: userFixture }) });
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Lobby" })).toBeInTheDocument();
  });
});
