import { TOKENS } from "@monopoly/shared";
import type { Game, Seat } from "@monopoly/shared";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { roomMessage, snapshotMessage, withStatus } from "../../game/fixtures.ts";
import { sessionKey } from "../../session/index.ts";
import {
  errorReply,
  gameInStatus,
  mockApi,
  userFixture,
  withClaims,
} from "../../testing/fakeApi.ts";
import { FakeRealtimeClient } from "../../testing/fakeRealtime.ts";
import { tEn } from "../../testing/tEn.ts";
import { createTestQueryClient, renderRoute } from "../../testing/render.tsx";
import { notBackHint } from "./roomModel.ts";

// The restore room (board SavedGames): a saved game's room, where each player claims their seats
// and the host starts the game at any time.
const me = userFixture.id;
const ines = "1b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d02";
const ravi = "1b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d03";

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
const marlow = seatOf(1, { name: "Marlow" });
const tove = seatOf(2, { name: "Tove", kind: "hotseat", userId: null });
const inesSeat = seatOf(3, { name: "Ines", userId: ines, controllerUserId: ines });
const raviSeat = seatOf(4, { name: "Ravi", userId: ravi, controllerUserId: ravi });

const gameId = gameInStatus("saved").id;
const savedRoom = (seats: Seat[]): Game =>
  gameInStatus("saved", { ownerId: me, seats, name: "Marlow's game" });

async function setup(game: Game, userId = me, routes: Parameters<typeof mockApi>[0] = {}) {
  const calls = mockApi({ [`GET /api/games/${gameId}`]: Response.json({ game }), ...routes });
  const realtime = new FakeRealtimeClient();
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(sessionKey, { ...userFixture, id: userId });
  const view = await renderRoute(`/games/${gameId}`, queryClient, { realtime });
  return { ...view, calls, realtime, user: userEvent.setup() };
}

/** The room has loaded: its heading, not the "Loading the game" one. */
const loaded = () => screen.findByRole("heading", { level: 1, name: /Marlow's game/ });
const seatRows = () => within(screen.getByRole("list")).getAllByRole("listitem");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("restore room: the page", () => {
  test("shows the Saved tag, the instruction and each seat as Back or Not back yet", async () => {
    await setup(
      savedRoom([
        { ...marlow, claimed: true },
        { ...tove, claimed: true },
        { ...inesSeat, claimed: true },
        raviSeat,
      ]),
    );
    const heading = await loaded();
    expect(heading).toHaveTextContent("Marlow's game");
    expect(heading).toHaveTextContent("Saved");
    expect(
      screen.getByText("Open this game link and claim your seats. Then the host starts the game."),
    ).toBeVisible();

    const rows = seatRows();
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent("Marlow");
    expect(rows[0]).toHaveTextContent("Host");
    expect(rows[0]).toHaveTextContent("Back");
    expect(rows[1]).toHaveTextContent("This device");
    expect(rows[3]).toHaveTextContent("Ravi");
    expect(rows[3]).toHaveTextContent("Not back yet");
  });

  test("has no open seats, invites, token picker, invite link or add form", async () => {
    await setup(savedRoom([marlow, inesSeat]));
    await loaded();
    expect(screen.queryByText("Open seat")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove|Add/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Leave game" })).not.toBeInTheDocument();
  });

  test("a saved game stays in the room: no redirect to the play screen", async () => {
    const { router } = await setup(savedRoom([marlow, inesSeat]));
    await loaded();
    expect(router.state.location.pathname).toBe(`/games/${gameId}`);
  });

  test("a visitor with no seat is told that only the players can continue it", async () => {
    await setup(savedRoom([marlow, inesSeat]), "0b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d77");
    await loaded();
    expect(
      screen.getByText("This game is saved. Only the players of the game can continue it."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /Claim|Start/ })).not.toBeInTheDocument();
  });
});

describe("restore room: a guest", () => {
  const room = () => savedRoom([marlow, tove, inesSeat, raviSeat]);

  test("before the claim: Claim my seats, and no Start", async () => {
    await setup(room(), ines);
    expect(await screen.findByRole("button", { name: "Claim my seats" })).toBeEnabled();
    expect(screen.getByText("Claim your seats so the host sees that you are back.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Start game" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Waiting for/)).not.toBeInTheDocument();
  });

  test("Claim calls the claim route once and then waits for the host", async () => {
    const { user, calls } = await setup(room(), ines, {
      [`POST /api/games/${gameId}/claim`]: Response.json({
        game: withClaims(room(), [inesSeat.id]),
      }),
    });
    await user.click(await screen.findByRole("button", { name: "Claim my seats" }));

    expect(await screen.findByText("Waiting for Marlow to start the game.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Claim my seats" })).not.toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST").map((c) => c.path)).toEqual([
      `/api/games/${gameId}/claim`,
    ]);
  });

  test("an already claimed guest only waits for the host", async () => {
    await setup(withClaims(room(), [inesSeat.id]), ines);
    expect(await screen.findByText("Waiting for Marlow to start the game.")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("a refused claim shows the message", async () => {
    const { user } = await setup(room(), ines, {
      [`POST /api/games/${gameId}/claim`]: errorReply(409, "game_not_saved"),
    });
    await user.click(await screen.findByRole("button", { name: "Claim my seats" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This game is not saved any more.");
  });

  test("another player's claim arrives live", async () => {
    const { realtime } = await setup(room(), ines);
    await loaded();
    expect(seatRows()[3]).toHaveTextContent("Not back yet");

    act(() => realtime.emit(roomMessage(withClaims(room(), [raviSeat.id]))));
    await waitFor(() => expect(seatRows()[3]).toHaveTextContent("Back"));
    expect(seatRows()[3]).not.toHaveTextContent("Not back yet");
  });

  test("the host's Start moves the guest to the play screen", async () => {
    const { realtime, router } = await setup(room(), ines);
    await loaded();
    act(() => realtime.emit(snapshotMessage(withStatus(room(), "active"), null)));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/games/${gameId}/play`));
  });
});

describe("restore room: the host", () => {
  const room = (claimedIds: string[] = []) =>
    withClaims(savedRoom([marlow, tove, inesSeat, raviSeat]), claimedIds);
  const allBack = [marlow.id, tove.id, inesSeat.id, raviSeat.id];

  test("Start is there and enabled even when a player is not back, and the hint says who waits", async () => {
    await setup(room([marlow.id, tove.id, inesSeat.id]));
    const start = await screen.findByRole("button", { name: "Start game" });
    expect(start).not.toHaveAttribute("aria-disabled");
    expect(start).toHaveAccessibleDescription(
      "Ravi is not back. If you start now, the game waits for Ravi on Ravi's turn.",
    );
    expect(screen.queryByRole("button", { name: "Claim my seats" })).not.toBeInTheDocument();
  });

  test("with everybody back the hint says so", async () => {
    await setup(room(allBack));
    const start = await screen.findByRole("button", { name: "Start game" });
    expect(start).toHaveAccessibleDescription("All players are back.");
  });

  test("a host who has not claimed also sees Claim my seats", async () => {
    await setup(room([inesSeat.id, raviSeat.id]));
    expect(await screen.findByRole("button", { name: "Claim my seats" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Start game" })).toBeEnabled();
  });

  test("Start calls the restore route and goes to play", async () => {
    const restored = withStatus(room(allBack), "active");
    let status: Game["status"] = "saved";
    const { user, router, calls } = await setup(room(allBack), me, {
      [`GET /api/games/${gameId}`]: () => Response.json({ game: { ...restored, status } }),
      [`POST /api/games/${gameId}/restore`]: () => {
        status = "active";
        return Response.json({ game: restored });
      },
    });
    await user.click(await screen.findByRole("button", { name: "Start game" }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/games/${gameId}/play`));
    expect(calls.filter((c) => c.method === "POST").map((c) => c.path)).toEqual([
      `/api/games/${gameId}/restore`,
    ]);
  });

  test("a refused Start shows the message and stays", async () => {
    const { user, router } = await setup(room(allBack), me, {
      [`POST /api/games/${gameId}/restore`]: errorReply(409, "game_not_saved"),
    });
    await user.click(await screen.findByRole("button", { name: "Start game" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This game is not saved any more.");
    expect(router.state.location.pathname).toBe(`/games/${gameId}`);
  });
});

describe("restore room: finished while open", () => {
  test("a guest sees who finished it and can open the result", async () => {
    const saved = savedRoom([marlow, tove, inesSeat, raviSeat]);
    let status: Game["status"] = "saved";
    const { realtime, router, user } = await setup(saved, ines, {
      [`GET /api/games/${gameId}`]: () => Response.json({ game: { ...saved, status } }),
      [`GET /api/games/${gameId}/state`]: new Promise<Response>(() => {}),
      [`GET /api/games/${gameId}/result`]: new Promise<Response>(() => {}),
    });
    await loaded();

    status = "finished";
    act(() => realtime.emit(snapshotMessage(withStatus(saved, "finished"), null)));

    expect(await screen.findByRole("heading", { name: "Game finished by Marlow" })).toBeVisible();
    expect(
      screen.getByText("Marlow finished this saved game. The standings are on the result page."),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe(`/games/${gameId}`);

    await user.click(screen.getByRole("button", { name: "See the result" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/games/${gameId}/play`));
  });

  test("a finished game that is opened later goes straight to the result", async () => {
    const finished = withStatus(savedRoom([marlow, inesSeat]), "finished");
    const { router } = await setup(finished, ines);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/games/${gameId}/play`));
  });
});

describe("notBackHint", () => {
  test("names one player, two players, or everybody", () => {
    const seats = (flags: boolean[]) =>
      [marlow, tove, inesSeat, raviSeat].map((s, i) => ({ ...s, claimed: flags[i]! }));
    expect(notBackHint(seats([true, true, true, true]), tEn)).toBe("All players are back.");
    expect(notBackHint(seats([true, true, true, false]), tEn)).toBe(
      "Ravi is not back. If you start now, the game waits for Ravi on Ravi's turn.",
    );
    expect(notBackHint(seats([true, true, false, false]), tEn)).toBe(
      "Ines and Ravi are not back. If you start now, the game waits for each of them on their turn.",
    );
    expect(notBackHint(seats([false, true, false, false]), tEn)).toMatch(
      /^Marlow, Ines and Ravi are not back\./,
    );
  });
});
