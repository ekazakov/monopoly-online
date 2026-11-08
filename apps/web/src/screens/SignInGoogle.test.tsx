import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { errorReply, mockApi, userFixture } from "../testing/fakeApi.ts";
import { renderRouteWithServerSession as renderRoute } from "../testing/render.tsx";

const signedOut = () => errorReply(401, "unauthorized");
const methods = (google: boolean, guest: boolean) => Response.json({ google, guest });
const google = () => screen.getByRole("link", { name: /google/i });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("9 Google only", () => {
  test("shows the Google link and the privacy note, and no name form", async () => {
    mockApi({ "GET /api/me": signedOut(), "GET /api/auth/methods": methods(true, false) });
    await renderRoute("/sign-in");
    const link = await screen.findByRole("link", { name: "Continue with Google" });
    // A full navigation: the browser loads the API route, which redirects to Google.
    expect(link).toHaveAttribute("href", "/api/auth/google/start");
    expect(screen.getByText(/We keep only your Google account id/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Display name")).not.toBeInTheDocument();
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });
});

describe("10 Google and guest", () => {
  test("shows the link, a separator and the guest form", async () => {
    mockApi({ "GET /api/me": signedOut(), "GET /api/auth/methods": methods(true, true) });
    await renderRoute("/sign-in");
    expect(await screen.findByRole("link", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.getByRole("separator")).toHaveTextContent("or, guest name");
    expect(screen.getByLabelText("Display name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  test("the guest form still signs in", async () => {
    const calls = mockApi({
      "GET /api/me": signedOut(),
      "GET /api/auth/methods": methods(true, true),
      "POST /api/session": Response.json({ user: userFixture }, { status: 201 }),
    });
    const { router } = await renderRoute("/sign-in");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Display name"), "Marlow");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(calls.some((c) => c.method === "POST" && c.path === "/api/session")).toBe(true);
  });
});

describe("guest only", () => {
  test("shows no Google link", async () => {
    mockApi({ "GET /api/me": signedOut() });
    await renderRoute("/sign-in");
    expect(await screen.findByLabelText("Display name")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /google/i })).not.toBeInTheDocument();
  });
});

describe("11 Google refused", () => {
  test("shows the error and a retry link", async () => {
    mockApi({ "GET /api/me": signedOut(), "GET /api/auth/methods": methods(true, false) });
    await renderRoute("/sign-in?error=oauth_failed");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Google did not sign you in. Try again, or ask the host to check the setup.",
    );
    expect(google()).toHaveTextContent("Try again with Google");
    expect(google()).toHaveAttribute("href", "/api/auth/google/start");
  });

  test("an unknown error value shows no error", async () => {
    mockApi({ "GET /api/me": signedOut(), "GET /api/auth/methods": methods(true, false) });
    await renderRoute("/sign-in?error=whatever");
    expect(await screen.findByRole("link", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("12 and 13 name step", () => {
  const open = async (routes: Parameters<typeof mockApi>[0] = {}, path = "/sign-in?step=name") => {
    const calls = mockApi({
      "GET /api/me": signedOut(),
      "GET /api/auth/methods": methods(true, false),
      ...routes,
    });
    const view = await renderRoute(path);
    const input = await screen.findByLabelText("Display name");
    return { ...view, calls, input, user: userEvent.setup() };
  };

  test("shows the Google lead and the name form, with focus in the field", async () => {
    const { input } = await open();
    expect(
      screen.getByText("You are signed in with Google. Pick the name friends see at the table."),
    ).toBeInTheDocument();
    expect(input).toHaveFocus();
    expect(screen.queryByRole("link", { name: /google/i })).not.toBeInTheDocument();
  });

  test("posts the name and opens the app signed in", async () => {
    const { input, user, calls, router, queryClient } = await open({
      "POST /api/auth/google/name": Response.json({ user: userFixture }),
    });
    await user.type(input, "Marlow");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(calls.find((c) => c.path === "/api/auth/google/name")?.body).toEqual({
      name: "Marlow",
    });
    expect(queryClient.getQueryData(["session"])).toEqual(userFixture);
  });

  test("opens the redirect target after the name", async () => {
    const { input, user, router } = await open(
      { "POST /api/auth/google/name": Response.json({ user: userFixture }) },
      "/sign-in?step=name&redirect=%2Fgames%2Fx",
    );
    await user.type(input, "Marlow");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/games/x"));
  });

  test("a name that is taken shows the error and keeps the name", async () => {
    const { input, user } = await open({
      "POST /api/auth/google/name": errorReply(409, "name_taken"),
    });
    await user.type(input, "Marlow");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That name is taken. Try another one.",
    );
    expect(input).toHaveValue("Marlow");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  test("a lost pending sign-in goes back to the Google error", async () => {
    const { input, user, router } = await open({
      "POST /api/auth/google/name": errorReply(401, "unauthorized"),
    });
    await user.type(input, "Marlow");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ error: "oauth_failed" }),
    );
    expect(await screen.findByRole("link", { name: "Try again with Google" })).toBeInTheDocument();
  });
});

describe("14 options not loaded", () => {
  test("shows the error and loads again on Try again", async () => {
    let up = false;
    mockApi({
      "GET /api/me": signedOut(),
      "GET /api/auth/methods": () =>
        up ? methods(true, false) : errorReply(500, "internal_error"),
    });
    await renderRoute("/sign-in");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not load the sign-in options. Check the connection and try again.",
    );
    up = true;
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
