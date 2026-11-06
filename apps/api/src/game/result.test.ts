import type { GameEvent, GameState } from "@monopoly/game-engine";
import { describe, expect, test } from "vite-plus/test";
import { buildGameResult, netWorthOf } from "./result.ts";
import { newGame, playGame } from "./test-helpers.ts";

const IDS = ["seat-a", "seat-b", "seat-c", "seat-d"];
const [a, b, c, d] = IDS as [string, string, string, string];
const seats = IDS.map((id) => ({ id, controllerUserId: `user-of-${id}` }));

const turnEnded = (playerId: string, nextPlayerId: string): GameEvent => ({
  type: "TurnEnded",
  playerId,
  nextPlayerId,
});
const resign = (playerId: string): GameEvent[] => [
  { type: "PlayerResigned", playerId },
  { type: "PlayerEliminated", playerId },
];
const bankrupt = (playerId: string): GameEvent[] => [
  { type: "BankruptcyDeclared", playerId, creditorIds: [] },
  { type: "PlayerEliminated", playerId },
];

function withState(state: GameState, patch: Partial<GameState>): GameState {
  return { ...state, ...patch };
}

describe("netWorthOf", () => {
  test("adds cash, property prices (half when mortgaged) and build costs", () => {
    const base = newGame(1, IDS);
    const state = withState(base, {
      players: base.players.map((p) => (p.id === a ? { ...p, cash: 700 } : p)),
      ownership: {
        // Driftwood Lane: price 60, one hotel (5 x 50 build cost).
        "1": { ownerId: a, houses: 5, mortgaged: false },
        // Kelp Court: price 60, mortgaged.
        "3": { ownerId: a, houses: 0, mortgaged: true },
        // North Station: price 200.
        "5": { ownerId: a, houses: 0, mortgaged: false },
        // Another player's property does not count.
        "6": { ownerId: b, houses: 0, mortgaged: false },
      },
    });
    expect(netWorthOf(state, a)).toEqual({
      cash: 700,
      properties: 3,
      netWorth: 700 + (60 + 250) + 30 + 200,
    });
    expect(netWorthOf(state, c)).toEqual({ cash: 1500, properties: 0, netWorth: 1500 });
  });
});

describe("buildGameResult", () => {
  const state = (): GameState => {
    const base = newGame(1, IDS);
    return withState(base, {
      players: base.players.map((p) =>
        p.id === d ? { ...p, cash: 900 } : { ...p, active: false },
      ),
      ownership: { "1": { ownerId: d, houses: 2, mortgaged: false } },
    });
  };

  test("ranks by elimination order, tells resigned from bankrupt, counts rounds", () => {
    // 4 seats: a round is 4 TurnEnded events.
    const events: GameEvent[] = [
      turnEnded(a, b),
      turnEnded(b, c),
      ...bankrupt(c),
      turnEnded(c, d),
      turnEnded(d, a), // 4 turns ended: round 2 starts
      ...resign(a),
      turnEnded(a, b),
      ...resign(b),
      { type: "GameEnded", winnerId: d },
    ];
    const result = buildGameResult({ gameId: "game-1", state: state(), events, seats });
    expect(result).toEqual({
      gameId: "game-1",
      rounds: 2,
      winner: { seatId: d, name: "Player 4" },
      finishedBy: null,
      standings: [
        {
          rank: 1,
          seatId: d,
          name: "Player 4",
          controllerUserId: `user-of-${d}`,
          status: "winner",
          outRound: null,
          cash: 900,
          properties: 1,
          netWorth: 900 + 60 + 100,
        },
        {
          rank: 2,
          seatId: b,
          name: "Bo",
          controllerUserId: `user-of-${b}`,
          status: "resigned",
          outRound: 2,
          cash: 0,
          properties: 0,
          netWorth: 0,
        },
        {
          rank: 3,
          seatId: a,
          name: "Ann",
          controllerUserId: `user-of-${a}`,
          status: "resigned",
          outRound: 2,
          cash: 0,
          properties: 0,
          netWorth: 0,
        },
        {
          rank: 4,
          seatId: c,
          name: "Cy",
          controllerUserId: `user-of-${c}`,
          status: "bankrupt",
          outRound: 1,
          cash: 0,
          properties: 0,
          netWorth: 0,
        },
      ],
    });
  });

  test("a game that ends in the first round has one round", () => {
    const events = [...resign(a), ...resign(b), ...bankrupt(c), { type: "GameEnded", winnerId: d }];
    const result = buildGameResult({
      gameId: "game-1",
      state: state(),
      events: events as GameEvent[],
      seats,
    });
    expect(result?.rounds).toBe(1);
    expect(result?.standings.map((s) => [s.rank, s.seatId, s.status])).toEqual([
      [1, d, "winner"],
      [2, c, "bankrupt"],
      [3, b, "resigned"],
      [4, a, "resigned"],
    ]);
  });

  describe("finished by the owner, with no winner", () => {
    // c is bankrupt. b, d and a are still in the game: d owns a street with 2 houses.
    const base = newGame(1, IDS);
    const noWinner = withState(base, {
      players: base.players.map((p) => {
        if (p.id === a) return { ...p, cash: 900 };
        if (p.id === b) return { ...p, cash: 900 };
        if (p.id === d) return { ...p, cash: 300 };
        return { ...p, cash: 0, active: false };
      }),
      ownership: { "1": { ownerId: d, houses: 2, mortgaged: false } },
    });
    const events: GameEvent[] = [turnEnded(a, b), ...bankrupt(c), turnEnded(b, d)];
    const build = (extra: Partial<Parameters<typeof buildGameResult>[0]> = {}) =>
      buildGameResult({
        gameId: "game-1",
        state: noWinner,
        events,
        seats,
        finishedBy: "Evgenii",
        ...extra,
      });

    test("players in the game rank first by net worth, then the players who are out", () => {
      const result = build();
      expect(result).toMatchObject({ winner: null, finishedBy: "Evgenii", rounds: 1 });
      // d: 300 + 60 + 100 = 460. a and b: 900 each, so the turn order of the state decides.
      const [tiedFirst, tiedSecond] = noWinner.players.filter((p) => p.id === a || p.id === b);
      expect(result?.standings.map((s) => [s.rank, s.seatId, s.status, s.netWorth])).toEqual([
        [1, tiedFirst?.id, "in_game", 900],
        [2, tiedSecond?.id, "in_game", 900],
        [3, d, "in_game", 460],
        [4, c, "bankrupt", 0],
      ]);
      expect(result?.standings[2]).toMatchObject({ cash: 300, properties: 1, outRound: null });
      expect(result?.standings[3]).toMatchObject({ outRound: 1, cash: 0 });
    });

    test("a player who resigned ranks below the players in the game", () => {
      const result = build({ events: [...resign(b), ...bankrupt(c)] });
      expect(result?.standings.map((s) => [s.rank, s.seatId, s.status])).toEqual([
        [1, a, "in_game"],
        [2, d, "in_game"],
        [3, c, "bankrupt"],
        [4, b, "resigned"],
      ]);
    });

    test("still returns null without finishedBy", () => {
      expect(build({ finishedBy: null })).toBeNull();
      expect(build({ finishedBy: undefined })).toBeNull();
    });

    test("a game with a GameEnded event has a winner and no finishedBy", () => {
      const ended = build({
        events: [...resign(b), ...bankrupt(c), ...resign(d), { type: "GameEnded", winnerId: a }],
      });
      expect(ended).toMatchObject({ winner: { seatId: a }, finishedBy: null });
      expect(ended?.standings[0]?.status).toBe("winner");
    });
  });

  test("returns null when the events hold no GameEnded", () => {
    expect(
      buildGameResult({ gameId: "game-1", state: state(), events: resign(a), seats }),
    ).toBeNull();
  });

  test("a seeded engine game gives a consistent result", () => {
    const played = playGame(12, 20000, newGame(12, IDS));
    const final = played.steps.at(-1)?.state as GameState;
    expect(final.turn.phase).toBe("game_over");
    const events = played.steps.flatMap((step) => step.events);
    const result = buildGameResult({ gameId: "game-1", state: final, events, seats });
    expect(result).not.toBeNull();
    if (!result) return;

    const turns = events.filter((e) => e.type === "TurnEnded").length;
    expect(result.rounds).toBe(1 + Math.floor(turns / 4));
    expect(result.standings.map((s) => s.rank)).toEqual([1, 2, 3, 4]);
    const winner = final.players.find((p) => p.active);
    expect(result.winner?.seatId).toBe(winner?.id);
    const [first, ...others] = result.standings;
    expect(first).toMatchObject({ seatId: winner?.id, status: "winner", outRound: null });
    expect(first?.cash).toBe(winner?.cash);
    expect(first?.properties).toBe(
      Object.values(final.ownership).filter((e) => e.ownerId === winner?.id).length,
    );
    expect(first?.netWorth).toBeGreaterThanOrEqual(first?.cash ?? 0);
    // From the first one out to the last one out the out rounds never decrease.
    const rounds = others.map((s) => s.outRound as number).reverse();
    expect([...rounds].sort((x, y) => x - y)).toEqual(rounds);
    expect(Math.max(...rounds)).toBeLessThanOrEqual(result.rounds);
    for (const s of others) {
      expect(s).toMatchObject({ cash: 0, properties: 0, netWorth: 0 });
      expect(s.status).toBe("resigned");
    }
  });
});
