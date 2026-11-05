import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { getGame } from "../api/index.ts";
import { errorReply, gameFixture, mockApi, noContent, userFixture } from "../testing/fakeApi.ts";
import { renderRouteWithServerSession as renderRoute } from "../testing/render.tsx";
import { sessionKey } from "./queries.ts";

const gameId = gameFixture().id;
const me = () => Response.json({ user: userFixture });
const signedOut = () => errorReply(401, "unauthorized");
const game = () => Response.json({ game: gameFixture() });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("guard without a session", () => {
  test("/ goes to sign-in", async () => {
    mockApi({ "GET /api/me": signedOut() });
    const { router } = await renderRoute("/");
    expect(await screen.findByRole("heading", { name: "Pick a name to play" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/sign-in");
    expect(router.state.location.search).toEqual({});
  });

  test.each([`/games/${gameId}`, `/games/${gameId}/play`])(
    "%s goes to sign-in and keeps the path in redirect",
    async (path) => {
      mockApi({ "GET /api/me": signedOut() });
      const { router } = await renderRoute(path);
      expect(await screen.findByLabelText("Display name")).toBeInTheDocument();
      expect(router.state.location.pathname).toBe("/sign-in");
      expect(router.state.location.search).toEqual({ redirect: path });
    },
  );

  test("the query string of the target stays in redirect", async () => {
    mockApi({ "GET /api/me": signedOut() });
    const { router } = await renderRoute(`/games/${gameId}?seat=2`);
    await screen.findByLabelText("Display name");
    expect(router.state.location.search).toEqual({ redirect: `/games/${gameId}?seat=2` });
  });

  test("a network failure of /api/me is not read as signed out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const { router } = await renderRoute("/");
    expect(router.state.location.pathname).toBe("/");
    expect(screen.queryByLabelText("Display name")).not.toBeInTheDocument();
  });
});

describe("guard with a session", () => {
  test("/ renders home with the user name", async () => {
    mockApi({ "GET /api/me": me() });
    const { router } = await renderRoute("/");
    expect(await screen.findByRole("heading", { name: "Lobby" })).toBeInTheDocument();
    expect(screen.getByText("Marlow")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
  });

  test("/sign-in goes to / without a redirect", async () => {
    mockApi({ "GET /api/me": me() });
    const { router } = await renderRoute("/sign-in");
    expect(await screen.findByRole("heading", { name: "Lobby" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
  });

  test("/sign-in goes to the redirect target", async () => {
    mockApi({ "GET /api/me": me(), [`GET /api/games/${gameId}`]: game() });
    const { router } = await renderRoute(
      `/sign-in?redirect=${encodeURIComponent(`/games/${gameId}`)}`,
    );
    expect(await screen.findByRole("heading", { name: gameFixture().name })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/games/${gameId}`);
  });

  test("the redirect target keeps its query string", async () => {
    mockApi({ "GET /api/me": me(), [`GET /api/games/${gameId}`]: game() });
    const target = `/games/${gameId}?seat=2`;
    const { router } = await renderRoute(`/sign-in?redirect=${encodeURIComponent(target)}`);
    await screen.findByRole("heading", { name: gameFixture().name });
    expect(router.state.location.href).toBe(target);
  });

  test.each([
    ["a protocol-relative URL", "//evil.com"],
    ["an absolute URL", "https://x"],
    ["a backslash path", "/\\x"],
  ])("%s in redirect is ignored", async (_name, redirect) => {
    mockApi({ "GET /api/me": me() });
    const { router } = await renderRoute(`/sign-in?redirect=${encodeURIComponent(redirect)}`);
    expect(await screen.findByRole("heading", { name: "Lobby" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
    expect(window.location.hostname).not.toBe("evil.com");
  });

  test("a bad redirect is not passed to the sign-in screen", async () => {
    mockApi({ "GET /api/me": signedOut() });
    const { router } = await renderRoute(`/sign-in?redirect=${encodeURIComponent("//evil.com")}`);
    await screen.findByLabelText("Display name");
    expect(router.state.matches.at(-1)?.search).toEqual({ redirect: undefined });
  });
});

describe("401 handling", () => {
  test("a 401 from any call clears the session and sends the user to sign-in", async () => {
    const calls: string[] = [];
    mockApi({
      "GET /api/me": me(),
      [`GET /api/games/${gameId}`]: () => {
        calls.push("game");
        return calls.length === 1 ? game() : errorReply(401, "unauthorized");
      },
    });
    const { router, queryClient } = await renderRoute(`/games/${gameId}`);
    await screen.findByRole("heading", { name: gameFixture().name });
    expect(queryClient.getQueryData(sessionKey)).toEqual(userFixture);

    await expect(getGame(gameId)).rejects.toMatchObject({ status: 401 });

    expect(await screen.findByLabelText("Display name")).toBeInTheDocument();
    expect(queryClient.getQueryData(sessionKey)).toBeNull();
    expect(router.state.location.pathname).toBe("/sign-in");
    expect(router.state.location.search).toEqual({ redirect: `/games/${gameId}` });
  });

  test("other cached data is dropped with the session", async () => {
    mockApi({ "GET /api/me": me(), [`GET /api/games/${gameId}`]: errorReply(401, "unauthorized") });
    const { queryClient } = await renderRoute("/");
    await screen.findByRole("heading", { name: "Lobby" });
    queryClient.setQueryData(["games", gameId], gameFixture());

    await getGame(gameId).catch(() => undefined);
    await screen.findByLabelText("Display name");

    expect(queryClient.getQueryData(["games", gameId])).toBeUndefined();
  });
});

describe("sign out", () => {
  test("the button ends the session and opens sign-in", async () => {
    const calls = mockApi({ "GET /api/me": me(), "DELETE /api/session": noContent() });
    const { router, queryClient } = await renderRoute("/");
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(await screen.findByLabelText("Display name")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "DELETE" && c.path === "/api/session")).toBe(true);
    expect(queryClient.getQueryData(sessionKey)).toBeNull();
    expect(router.state.location.pathname).toBe("/sign-in");
  });

  test("an expired session (401) still signs out", async () => {
    mockApi({ "GET /api/me": me(), "DELETE /api/session": errorReply(401, "unauthorized") });
    const { queryClient } = await renderRoute("/");
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByLabelText("Display name")).toBeInTheDocument();
    expect(queryClient.getQueryData(sessionKey)).toBeNull();
  });

  test("a server failure shows a message and keeps the session", async () => {
    mockApi({ "GET /api/me": me(), "DELETE /api/session": errorReply(500, "internal_error") });
    const { router, queryClient } = await renderRoute("/");
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not sign out");
    await waitFor(() => expect(queryClient.getQueryData(sessionKey)).toEqual(userFixture));
    expect(router.state.location.pathname).toBe("/");
  });
});
