import { TOKENS } from "@monopoly/shared";
import type { Game, RoomInvite, Seat } from "@monopoly/shared";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { roomMessage } from "../../game/fixtures.ts";
import { sessionKey } from "../../session/index.ts";
import { errorReply, gameFixture, mockApi, userFixture } from "../../testing/fakeApi.ts";
import { FakeRealtimeClient } from "../../testing/fakeRealtime.ts";
import { createTestQueryClient, renderRoute } from "../../testing/render.tsx";

const base = gameFixture();
const gameId = base.id;
const me = userFixture.id;
const otherId = "1b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d02";
const visitorId = "9b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d09";
const inviteUrl = `/api/games/${gameId}/invites`;

const owner = base.seats[0]!;
const seatOf = (n: number, fields: Partial<Seat>): Seat => ({
  id: `5b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d${String(60 + n)}`,
  order: n,
  name: `Seat${String(n)}`,
  kind: "user",
  userId: me,
  controllerUserId: me,
  token: TOKENS[n - 1]!,
  claimed: false,
  ...fields,
});
const ines = seatOf(2, { name: "Ines", userId: otherId, controllerUserId: otherId });

const pending = (name: string, n = 1): RoomInvite => ({
  id: `6b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d${String(10 + n)}`,
  userId: `7b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d${String(10 + n)}`,
  name,
  state: "pending",
});
const room = (seats: Seat[], invites: RoomInvite[] = [], fields: Partial<Game> = {}) =>
  gameFixture({ seats, invites, ...fields });

async function setup(game: Game, userId = me, routes: Parameters<typeof mockApi>[0] = {}) {
  const calls = mockApi({ [`GET /api/games/${gameId}`]: Response.json({ game }), ...routes });
  const realtime = new FakeRealtimeClient();
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(sessionKey, { ...userFixture, id: userId });
  const view = await renderRoute(`/games/${gameId}`, queryClient, { realtime });
  return { ...view, calls, realtime, user: userEvent.setup() };
}

const nameField = () => screen.findByRole("textbox", { name: "Player name" });
const startButton = () => screen.findByRole("button", { name: "Start game" });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("who sees the invite panel", () => {
  test("the host does, while seats are free", async () => {
    await setup(room([owner]));
    expect(await screen.findByRole("heading", { name: "Invite by name" })).toBeVisible();
    expect(await nameField()).toBeVisible();
    expect(screen.getByRole("button", { name: "Invite" })).toBeVisible();
  });

  test("a guest and a visitor do not", async () => {
    await setup(room([owner, ines]), otherId);
    await screen.findByRole("button", { name: "Leave game" });
    expect(screen.queryByRole("heading", { name: "Invite by name" })).toBeNull();
  });

  test("a visitor does not", async () => {
    await setup(room([owner]), visitorId);
    await screen.findByRole("button", { name: "Join game" });
    expect(screen.queryByRole("heading", { name: "Invite by name" })).toBeNull();
  });

  test("the host of a full room does not", async () => {
    const seats = [
      owner,
      ines,
      ...[3, 4, 5, 6].map((n) => seatOf(n, { userId: null, kind: "hotseat" })),
    ];
    await setup(room(seats));
    await startButton();
    expect(screen.queryByRole("heading", { name: "Invite by name" })).toBeNull();
  });
});

describe("invite by name", () => {
  test("sends the name, confirms it, clears the field and shows the invite as a row", async () => {
    const { user, calls } = await setup(room([owner]), me, {
      [`POST ${inviteUrl}`]: Response.json(
        { game: room([owner], [pending("Ravi")]) },
        { status: 201 },
      ),
    });
    await user.type(await nameField(), "  ravi ");
    await user.click(screen.getByRole("button", { name: "Invite" }));

    // The seat list has a live region too, so the message is found by its text.
    expect(await screen.findByText("Invite sent to Ravi.")).toHaveAttribute("role", "status");
    expect(calls.find((c) => c.method === "POST" && c.path === inviteUrl)?.body).toEqual({
      name: "ravi",
    });
    expect(await nameField()).toHaveValue("");

    const row = screen.getByText("Invited · waiting to accept").closest("li")!;
    expect(within(row).getByText("Ravi")).toBeVisible();
    expect(within(row).getByText("Invited")).toBeVisible();
    // The invite does not hold a seat.
    expect(screen.getByText("1 of 6 seats")).toBeVisible();
  });

  test("an unknown name says so and offers the link", async () => {
    const { user } = await setup(room([owner]), me, {
      [`POST ${inviteUrl}`]: errorReply(404, "user_not_found"),
    });
    await user.type(await nameField(), "zed");
    await user.click(screen.getByRole("button", { name: "Invite" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      'No player called "zed". Check the spelling, or share the invite link instead.',
    );
    expect(await nameField()).toHaveAttribute("aria-invalid", "true");
    expect(await nameField()).toHaveValue("zed");
    expect(screen.queryByText("Invited · waiting to accept")).toBeNull();
  });

  test.each([
    ["already_joined", "Already in this game."],
    ["already_invited", "Already invited. They have not answered yet."],
    ["cannot_invite_self", "You are already in this game."],
    ["game_not_waiting", "This game has already started."],
  ])("%s shows its own message", async (code, text) => {
    const { user } = await setup(room([owner]), me, {
      [`POST ${inviteUrl}`]: errorReply(409, code),
    });
    await user.type(await nameField(), "Tove");
    await user.click(screen.getByRole("button", { name: "Invite" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
  });

  test("checks the length locally, without a request", async () => {
    const { user, calls } = await setup(room([owner]));
    await user.type(await nameField(), "T");
    await user.click(screen.getByRole("button", { name: "Invite" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Use at least 2 characters.");
    await user.clear(await nameField());
    await user.click(await nameField());
    await user.paste("x".repeat(17));
    await user.click(screen.getByRole("button", { name: "Invite" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Use 16 characters or fewer.");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  test("typing clears the last answer", async () => {
    const { user } = await setup(room([owner]), me, {
      [`POST ${inviteUrl}`]: errorReply(404, "user_not_found"),
    });
    await user.type(await nameField(), "zed");
    await user.click(screen.getByRole("button", { name: "Invite" }));
    await screen.findByRole("alert");
    await user.type(await nameField(), "x");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("pending invites in the room", () => {
  test("show as rows in place of open seats, and the stream keeps them current", async () => {
    const { realtime } = await setup(room([owner], [pending("Ravi")]));
    await screen.findByText("Invited · waiting to accept");
    // 1 seat + 1 invite + 4 open seats: the list keeps its six rows.
    expect(screen.getAllByText("Open seat")).toHaveLength(4);

    // Ravi accepts: the invite is gone and the seat is there.
    const ravi = seatOf(2, { name: "Ravi", userId: otherId, controllerUserId: otherId });
    act(() => realtime.emit(roomMessage(room([owner, ravi], []))));
    await waitFor(() => expect(screen.queryByText("Invited · waiting to accept")).toBeNull());
    expect(screen.getByText("2 of 6 seats")).toBeVisible();
    expect(screen.getAllByText("Open seat")).toHaveLength(4);
  });

  test("a new invite from the stream appears at once", async () => {
    const { realtime } = await setup(room([owner]));
    await startButton();
    act(() => realtime.emit(roomMessage(room([owner], [pending("Tove")]))));
    expect(await screen.findByText("Invited · waiting to accept")).toBeVisible();
  });

  test("guests see the invites too", async () => {
    await setup(room([owner, ines], [pending("Ravi")]), otherId);
    expect(await screen.findByText("Invited · waiting to accept")).toBeVisible();
  });
});

describe("the start hint", () => {
  test("names the invitees who have not answered", async () => {
    await setup(room([owner, ines], [pending("Ravi")]));
    expect(await startButton()).toHaveAccessibleDescription(
      "2 players ready. Waiting for Ravi to accept.",
    );
  });

  test("lists two and three invitees in one sentence", async () => {
    await setup(room([owner, ines], [pending("Ravi", 1), pending("Tove", 2)]));
    expect(await startButton()).toHaveAccessibleDescription(
      "2 players ready. Waiting for Ravi and Tove to accept.",
    );
  });

  test("also says so when the host cannot start yet", async () => {
    await setup(room([owner], [pending("Ravi", 1), pending("Tove", 2), pending("Bo", 3)]));
    expect(await startButton()).toHaveAccessibleDescription(
      "Add at least one more player to start. Waiting for Ravi, Tove and Bo to accept.",
    );
  });

  test("has no invitee sentence without invites", async () => {
    await setup(room([owner, ines]));
    expect(await startButton()).toHaveAccessibleDescription("2 players ready.");
  });
});
