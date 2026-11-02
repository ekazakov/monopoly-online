import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { errorReply, gameFixture, mockApi, userFixture, type ApiCall } from "../testing/fakeApi.ts";
import { renderRouteWithServerSession as renderRoute } from "../testing/render.tsx";

const created = () => Response.json({ user: userFixture }, { status: 201 });
const signedOut = () => errorReply(401, "unauthorized");
const posts = (calls: ApiCall[]) => calls.filter((c) => c.method === "POST");

async function openSignIn(routes: Parameters<typeof mockApi>[0] = {}, path = "/sign-in") {
  const calls = mockApi({ "GET /api/me": signedOut(), ...routes });
  const view = await renderRoute(path);
  const input = await screen.findByLabelText("Display name");
  return { ...view, calls, input, user: userEvent.setup() };
}

const button = () => screen.getByRole("button", { name: /continue|signing in/i });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("1 idle", () => {
  test("shows the welcome copy, an empty field and the rule hint", async () => {
    const { input } = await openSignIn();
    expect(
      screen.getByRole("heading", { level: 1, name: "Pick a name to play" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/No password\. Names are unique/)).toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("placeholder", "Your name");
    expect(input).toHaveAttribute("autocomplete", "nickname");
    expect(input).toHaveAttribute("autocapitalize", "words");
    expect(input).toHaveAttribute("spellcheck", "false");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).toHaveAccessibleDescription("2 to 16 characters. Capital letters do not matter.");
    expect(screen.getByText("0/16")).toHaveAttribute("aria-hidden", "true");
    expect(button()).toHaveTextContent("Continue");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("focus starts in the field", async () => {
    const { input } = await openSignIn();
    expect(input).toHaveFocus();
  });
});

describe("2 typing", () => {
  test("the counter follows the trimmed length and the hint stays", async () => {
    const { input, user } = await openSignIn();
    await user.type(input, "Mar");
    expect(screen.getByText("3/16")).toBeInTheDocument();
    await user.type(input, "  ");
    expect(screen.getByText("3/16")).toBeInTheDocument();
    expect(input).toHaveAccessibleDescription("2 to 16 characters. Capital letters do not matter.");
  });

  test("no error shows while typing before the first submit", async () => {
    const { input, user } = await openSignIn();
    await user.type(input, "M");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-invalid");
  });
});

describe("3 valid", () => {
  test("a valid name that has lost focus says it looks good", async () => {
    const { input, user } = await openSignIn();
    await user.type(input, "Marlow");
    await user.tab();
    expect(input).toHaveAccessibleDescription("Looks good. Press Continue.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("6/16")).toBeInTheDocument();
  });
});

describe("4 and 5 invalid name", () => {
  test("too short: submit shows the error, keeps focus in the field and sends nothing", async () => {
    const { input, user, calls } = await openSignIn();
    await user.type(input, "M");
    await user.click(button());
    expect(await screen.findByRole("alert")).toHaveTextContent("Use at least 2 characters.");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Use at least 2 characters.");
    expect(input).toHaveFocus();
    expect(posts(calls)).toHaveLength(0);
  });

  test("an empty field is too short", async () => {
    const { input, user } = await openSignIn();
    await user.click(button());
    expect(await screen.findByRole("alert")).toHaveTextContent("Use at least 2 characters.");
    expect(input).toHaveFocus();
  });

  test("spaces around the name do not count", async () => {
    const { input, user, calls } = await openSignIn();
    await user.type(input, "  M   ");
    await user.click(button());
    expect(await screen.findByRole("alert")).toHaveTextContent("Use at least 2 characters.");
    expect(posts(calls)).toHaveLength(0);
  });

  test("too long: the counter goes over the limit and the error says so", async () => {
    const { input, user } = await openSignIn();
    await user.type(input, "Marlow Harborview");
    expect(input).toHaveValue("Marlow Harborview");
    await user.click(button());
    expect(await screen.findByRole("alert")).toHaveTextContent("Use 16 characters or fewer.");
    expect(screen.getByText("17/16")).toBeInTheDocument();
  });

  test("after the first error the check runs on each keystroke", async () => {
    const { input, user } = await openSignIn();
    await user.type(input, "M");
    await user.click(button());
    await screen.findByRole("alert");
    await user.type(input, "a");
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(input).not.toHaveAttribute("aria-invalid");
    await user.type(input, "rlow Harborview");
    expect(await screen.findByRole("alert")).toHaveTextContent("Use 16 characters or fewer.");
  });
});

describe("7 pending", () => {
  test("the button and field are busy, a second submit sends nothing, focus stays", async () => {
    let finish!: (res: Response) => void;
    const pending = new Promise<Response>((resolve) => (finish = resolve));
    const { input, user, calls, router } = await openSignIn({ "POST /api/session": () => pending });
    await user.type(input, "Marlow");
    await user.click(button());

    const busy = await screen.findByRole("button", { name: "Signing in" });
    expect(busy).toHaveAttribute("aria-disabled", "true");
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy).not.toBeDisabled();
    expect(input).toHaveAttribute("readonly");
    expect(input).toHaveAttribute("aria-busy", "true");
    expect(input).toHaveAccessibleDescription("Signing you in…");
    expect(busy).toHaveFocus();

    await user.click(busy);
    await user.keyboard("{Enter}");
    expect(posts(calls)).toHaveLength(1);

    finish(created());
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });
});

describe("6 name taken", () => {
  test("shows the field error, keeps the name and puts focus in the field", async () => {
    const { input, user } = await openSignIn({
      "POST /api/session": errorReply(409, "name_taken", "This name is taken"),
    });
    await user.type(input, "Ines");
    await user.click(button());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That name is taken. Try another one.",
    );
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveValue("Ines");
    expect(input).toHaveFocus();
    expect(input).not.toHaveAttribute("readonly");
    expect(button()).toHaveTextContent("Continue");
  });

  test("editing the name clears the server error", async () => {
    const { input, user } = await openSignIn({
      "POST /api/session": errorReply(409, "name_taken"),
    });
    await user.type(input, "Ines");
    await user.click(button());
    await screen.findByRole("alert");
    await user.type(input, "2");
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(input).not.toHaveAttribute("aria-invalid");
  });
});

describe("8 could not sign in", () => {
  const copy = "We could not sign you in. Check the connection and try again.";

  test("a lost connection shows the retry message and keeps the name", async () => {
    const { input, user } = await openSignIn({
      "POST /api/session": () => Promise.reject(new TypeError("Failed to fetch")),
    });
    await user.type(input, "Ines");
    await user.click(button());
    expect(await screen.findByRole("alert")).toHaveTextContent(copy);
    expect(input).toHaveValue("Ines");
    expect(input).not.toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveFocus();
    expect(button()).toHaveTextContent("Continue");
  });

  test("a 500 shows the same message", async () => {
    const { input, user } = await openSignIn({
      "POST /api/session": errorReply(500, "internal_error"),
    });
    await user.type(input, "Ines");
    await user.click(button());
    expect(await screen.findByRole("alert")).toHaveTextContent(copy);
  });

  test("try again works after the failure", async () => {
    let attempt = 0;
    const { input, user, router } = await openSignIn({
      "POST /api/session": () =>
        ++attempt === 1 ? Promise.reject(new TypeError("Failed to fetch")) : created(),
    });
    await user.type(input, "Ines");
    await user.click(button());
    await screen.findByRole("alert");
    await user.click(button());
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(attempt).toBe(2);
  });

  test("a 400 from the server is shown on the field", async () => {
    const { input, user } = await openSignIn({
      "POST /api/session": errorReply(400, "validation_error", "Bad", [
        { path: ["name"], message: "Name is not allowed" },
      ]),
    });
    await user.type(input, "Ines");
    await user.click(button());
    expect(await screen.findByRole("alert")).toHaveTextContent("Name is not allowed");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });
});

describe("201 created", () => {
  test("sends the trimmed name and opens home", async () => {
    const { input, user, calls, router, queryClient } = await openSignIn({
      "POST /api/session": created(),
    });
    await user.type(input, "  Marlow ");
    await user.click(button());
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(posts(calls)[0]).toMatchObject({ path: "/api/session", body: { name: "Marlow" } });
    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(queryClient.getQueryData(["session"])).toEqual(userFixture);
  });

  test("Enter in the field submits", async () => {
    const { input, user, router } = await openSignIn({ "POST /api/session": created() });
    await user.type(input, "Marlow{Enter}");
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  test("opens the redirect target", async () => {
    const gameId = "7b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d11";
    const { input, user, router } = await openSignIn(
      {
        "POST /api/session": created(),
        [`GET /api/games/${gameId}`]: Response.json({ game: gameFixture() }),
      },
      `/sign-in?redirect=${encodeURIComponent(`/games/${gameId}`)}`,
    );
    await user.type(input, "Marlow");
    await user.click(button());
    await waitFor(() => expect(router.state.location.pathname).toBe(`/games/${gameId}`));
    expect(await screen.findByRole("heading", { name: gameFixture().name })).toBeInTheDocument();
  });

  test.each(["//evil.com", "https://x", "/\\x"])(
    "ignores the unsafe redirect %s",
    async (redirect) => {
      const { input, user, router } = await openSignIn(
        { "POST /api/session": created() },
        `/sign-in?redirect=${encodeURIComponent(redirect)}`,
      );
      await user.type(input, "Marlow");
      await user.click(button());
      await waitFor(() => expect(router.state.location.pathname).toBe("/"));
      expect(router.state.location.href).toBe("/");
    },
  );
});

describe("409 already signed in", () => {
  test("reads /api/me and goes on without an error", async () => {
    let signedIn = false;
    const calls = mockApi({
      "GET /api/me": () => (signedIn ? Response.json({ user: userFixture }) : signedOut()),
      "POST /api/session": () => {
        signedIn = true; // another tab signed in meanwhile
        return errorReply(409, "already_signed_in", "Already signed in");
      },
    });
    const { router, queryClient } = await renderRoute("/sign-in");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Display name"), "Ines");
    await user.click(button());

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(queryClient.getQueryData(["session"])).toEqual(userFixture);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toContain("POST /api/session");
    expect(await screen.findByText("Marlow")).toBeInTheDocument();
  });
});
