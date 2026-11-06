import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TOKENS } from "@monopoly/shared";
import type { Game, GameResult, Seat, Standing } from "@monopoly/shared";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { actionsMessage, recordFixture, redact, withStatus } from "../../game/fixtures.ts";
import type { Step } from "../../game/fixtures.ts";
import { sessionKey } from "../../session/index.ts";
import { errorReply, mockApi, userFixture } from "../../testing/fakeApi.ts";
import { FakeRealtimeClient } from "../../testing/fakeRealtime.ts";
import { createTestQueryClient, renderRoute } from "../../testing/render.tsx";

const fx = recordFixture(2);
const { a, b, c } = fx.seats;
const finishedGame = withStatus(fx.game, "finished");

type Spec = Pick<Standing, "status"> & Partial<Standing>;

/** A result for `seats`: the first seat wins, the others went out in the given order (last out first). */
function resultOf(game: Game, specs: Spec[] = []): GameResult {
  const [winner, ...others] = game.seats;
  if (!winner) throw new Error("no seats");
  const standings: Standing[] = [
    {
      rank: 1,
      seatId: winner.id,
      name: winner.name,
      controllerUserId: winner.controllerUserId,
      status: "winner",
      outRound: null,
      cash: 2340,
      properties: 11,
      netWorth: 5180,
    },
    ...others.map((seat, index) => {
      const spec = specs[index] ?? { status: "bankrupt" as const };
      return {
        rank: index + 2,
        seatId: seat.id,
        name: seat.name,
        controllerUserId: seat.controllerUserId,
        outRound: 20 - index * 4,
        cash: 0,
        properties: 0,
        netWorth: 0,
        ...spec,
      } satisfies Standing;
    }),
  ];
  return {
    gameId: game.id,
    rounds: 21,
    winner: { seatId: winner.id, name: winner.name },
    finishedBy: null,
    standings,
  };
}

interface Options {
  game?: Game;
  result?: GameResult;
  resultReply?: Response | Promise<Response> | (() => Response);
  userId?: string;
}

async function setup({
  game = finishedGame,
  result = resultOf(game),
  resultReply,
  userId = fx.guestId,
}: Options = {}) {
  const calls = mockApi({
    [`GET /api/games/${game.id}`]: Response.json({ game }),
    [`GET /api/games/${game.id}/state`]: Response.json({
      version: 0,
      state: redact(fx.start),
    }),
    [`GET /api/games/${game.id}/result`]: resultReply ?? Response.json({ result }),
  });
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(sessionKey, { ...userFixture, id: userId });
  const view = await renderRoute(`/games/${game.id}/play`, queryClient, {
    realtime: new FakeRealtimeClient(),
  });
  return { ...view, calls };
}

const seatsOf = (count: number, controller: string): Seat[] =>
  Array.from({ length: count }, (_, index) => ({
    id: crypto.randomUUID(),
    // The server numbers seats from 1.
    order: index + 1,
    name: `Seat${index + 1}`,
    kind: "hotseat" as const,
    userId: null,
    controllerUserId: controller,
    token: TOKENS[index]!,
    claimed: false,
  }));

const rowsOf = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GameResultScreen: the finished game", () => {
  test("shows the winner, the sentence, the table and the only action", async () => {
    await setup({
      result: resultOf(finishedGame, [
        { status: "resigned", outRound: 18 },
        { status: "bankrupt" },
      ]),
    });

    const heading = await screen.findByRole("heading", { level: 1, name: "Ann wins" });
    expect(screen.getByText("Game over")).toBeInTheDocument();
    expect(screen.getByText("Last player left after 21 rounds.")).toBeInTheDocument();
    expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual([
      "Ann wins",
      "Final standings",
    ]);

    const table = screen.getByRole("table", { name: "Final standings" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Rank", "Player", "Final cash", "Properties", "Net worth", "Status"]);
    for (const header of within(table).getAllByRole("columnheader")) {
      expect(header).toHaveAttribute("scope", "col");
    }

    const [winner, resigned, bankrupt] = rowsOf() as [HTMLElement, HTMLElement, HTMLElement];
    expect(within(winner).getByRole("rowheader")).toHaveTextContent("1");
    expect(within(winner).getByRole("rowheader")).toHaveAttribute("scope", "row");
    expect(winner).toHaveTextContent("Ann");
    for (const text of ["$2,340", "11", "$5,180", "Winner"]) {
      expect(within(winner).getByText(text)).toBeInTheDocument();
    }
    expect(winner).toHaveAttribute("data-winner");
    expect(within(winner).getByRole("img", { name: "Ann, Scottish terrier" })).toBeInTheDocument();

    expect(within(resigned).getByRole("rowheader")).toHaveTextContent("2");
    expect(within(resigned).getByText("Resigned · round 18")).toBeInTheDocument();
    expect(within(resigned).getByRole("img", { name: "Bo, Cat" })).toBeInTheDocument();
    expect(resigned).not.toHaveAttribute("data-winner");
    expect(within(bankrupt).getByText("Bankrupt · round 16")).toBeInTheDocument();
    expect(within(bankrupt).getByRole("img", { name: "Cy, Penguin" })).toBeInTheDocument();

    // An out player shows a dash with the hidden word "none" in cash, properties and net worth.
    expect(within(resigned).getAllByText("—")).toHaveLength(3);
    expect(within(resigned).getAllByText("none")).toHaveLength(3);
    expect(within(resigned).queryByText(/\$/)).not.toBeInTheDocument();

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Back to home",
    ]);
    expect(heading).toBeInTheDocument();
  });

  test("moves focus to the heading", async () => {
    await setup();
    const heading = await screen.findByRole("heading", { name: "Ann wins" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(heading).toHaveAttribute("tabindex", "-1");
  });

  test("Back to home goes to the home screen", async () => {
    const { router } = await setup();
    await userEvent.click(await screen.findByRole("button", { name: "Back to home" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  test("a game of two players says one round for a short game", async () => {
    const game = { ...finishedGame, seats: [a, b] };
    const result = { ...resultOf(game), rounds: 1 };
    await setup({ game, result });
    expect(await screen.findByText("Last player left after 1 round.")).toBeInTheDocument();
    expect(rowsOf()).toHaveLength(2);
  });

  test.each([4, 6])("lists %i players in rank order with their own colours", async (count) => {
    const game = { ...finishedGame, seats: seatsOf(count, fx.ownerId) };
    await setup({ game, userId: fx.guestId });
    await screen.findByRole("heading", { name: "Seat1 wins" });
    const rows = rowsOf();
    expect(rows).toHaveLength(count);
    expect(rows.map((row) => within(row).getByRole("rowheader").textContent)).toEqual(
      Array.from({ length: count }, (_, i) => String(i + 1)),
    );
    expect(rows.map((row) => within(row).getByRole("img").getAttribute("aria-label"))).toEqual(
      [
        "Seat1, Scottish terrier",
        "Seat2, Cat",
        "Seat3, Penguin",
        "Seat4, Racing car",
        "Seat5, Horse",
        "Seat6, Duck",
      ].slice(0, count),
    );
    // The pawn colour is the avatar ring, taken from the token of the seat.
    const rings = rows.map((row) => within(row).getByRole("img").style.borderColor);
    expect(new Set(rings).size).toBe(count);
  });

  test("tags the seats of this device, own seat and hot-seat seats", async () => {
    await setup({ userId: fx.ownerId });
    await screen.findByRole("heading", { name: "Ann wins" });
    const [ann, bo, cy] = rowsOf() as [HTMLElement, HTMLElement, HTMLElement];
    expect(within(ann).getByText("This device")).toBeInTheDocument();
    expect(within(bo).queryByText("This device")).not.toBeInTheDocument();
    expect(within(cy).getByText("This device")).toBeInTheDocument();
    expect(c.kind).toBe("hotseat");
  });

  test("tags only the own seat of a guest", async () => {
    await setup({ userId: fx.guestId });
    await screen.findByRole("heading", { name: "Ann wins" });
    expect(screen.getAllByText("This device")).toHaveLength(1);
    expect(within(rowsOf()[1] as HTMLElement).getByText("This device")).toBeInTheDocument();
  });
});

describe("GameResultScreen: loading and error", () => {
  test("shows a busy status while the result loads", async () => {
    await setup({ resultReply: new Promise<Response>(() => {}) });
    const text = await screen.findByText("Loading the result…");
    const status = text.closest<HTMLElement>('[role="status"]');
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  test("shows an alert with Try again and Back to home when the read fails", async () => {
    const { calls } = await setup({ resultReply: errorReply(500, "internal_error") });
    const heading = await screen.findByRole("heading", { level: 1, name: "Result not available" });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "We could not load the result. Check the connection and try again.",
    );
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Try again",
      "Back to home",
    ]);
    await waitFor(() => expect(heading).toHaveFocus());
    expect(calls.filter((call) => call.path.endsWith("/result"))).toHaveLength(1);
  });

  test("Try again reads the result once more and shows it", async () => {
    let attempt = 0;
    const { calls } = await setup({
      resultReply: () =>
        ++attempt === 1
          ? errorReply(500, "internal_error")
          : Response.json({ result: resultOf(finishedGame) }),
    });
    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
    const heading = await screen.findByRole("heading", { level: 1, name: "Ann wins" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await waitFor(() => expect(heading).toHaveFocus());
    expect(calls.filter((call) => call.path.endsWith("/result"))).toHaveLength(2);
  });

  test("Back to home in the error view goes to the home screen", async () => {
    const { router } = await setup({ resultReply: errorReply(500, "internal_error") });
    await userEvent.click(await screen.findByRole("button", { name: "Back to home" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });
});

describe("GameScreen: the result replaces the game", () => {
  test("shows the result when the room is finished on load", async () => {
    await setup();
    expect(await screen.findByRole("heading", { name: "Ann wins" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Roll" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Game over" })).not.toBeInTheDocument();
  });

  test("a game that ends live switches to the result and reads the room again", async () => {
    const realtime = new FakeRealtimeClient();
    let ended = false;
    const calls = mockApi({
      [`GET /api/games/${fx.game.id}`]: () =>
        Response.json({ game: ended ? finishedGame : fx.game }),
      [`GET /api/games/${fx.game.id}/state`]: Response.json({
        version: 0,
        state: redact(fx.start),
      }),
      [`GET /api/games/${fx.game.id}/result`]: () =>
        Response.json({ result: resultOf(finishedGame) }),
    });
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(sessionKey, { ...userFixture, id: fx.guestId });
    await renderRoute(`/games/${fx.game.id}/play`, queryClient, { realtime });
    expect(await screen.findByRole("button", { name: "Roll" })).toBeInTheDocument();
    const roomCalls = () => calls.filter((call) => call.path === `/api/games/${fx.game.id}`).length;
    expect(roomCalls()).toBe(1);

    const first = fx.steps[0] as Step;
    const over: Step = {
      ...first,
      state: {
        ...first.state,
        version: 1,
        turn: { ...first.state.turn, currentPlayerId: a.id, phase: "game_over" },
        players: first.state.players.map((p) => ({ ...p, active: p.id === a.id })),
      },
      events: [{ type: "GameEnded", winnerId: a.id }],
    };
    ended = true;
    act(() => realtime.emit(actionsMessage(fx.game, over)));

    expect(await screen.findByRole("heading", { name: "Ann wins" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Roll" })).not.toBeInTheDocument();
    await waitFor(() => expect(roomCalls()).toBe(2));
    expect(calls.some((call) => call.path.endsWith("/result"))).toBe(true);
  });
});
