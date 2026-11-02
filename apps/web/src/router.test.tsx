import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { renderRoute } from "./testing/render.tsx";

const gameId = "7b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d11";

describe("routes", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ status: "ok" })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("/ renders home and reaches the API", async () => {
    await renderRoute("/");
    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(await screen.findByText("API ok")).toBeInTheDocument();
  });

  test("/sign-in renders the sign-in screen", async () => {
    await renderRoute("/sign-in");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  test("/games/$gameId renders the room with the game id", async () => {
    await renderRoute(`/games/${gameId}`);
    expect(await screen.findByRole("heading", { name: "Room" })).toBeInTheDocument();
    expect(screen.getByText(`Game ${gameId}`)).toBeInTheDocument();
  });

  test("/games/$gameId/play renders the game with the game id", async () => {
    await renderRoute(`/games/${gameId}/play`);
    expect(await screen.findByRole("heading", { name: "Game" })).toBeInTheDocument();
    expect(screen.getByText(`Game ${gameId}`)).toBeInTheDocument();
  });

  test("an unknown path renders the not-found view", async () => {
    await renderRoute("/no/such/page");
    expect(await screen.findByRole("heading", { name: "Not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
  });
});
