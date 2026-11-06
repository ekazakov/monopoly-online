import { describe, expect, test } from "vite-plus/test";
import { gameResultResponseSchema, gameResultSchema, standingSchema } from "./index.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const winner = {
  rank: 1,
  seatId: id(1),
  name: "Ann",
  controllerUserId: id(101),
  status: "winner" as const,
  outRound: null,
  cash: 1200,
  properties: 3,
  netWorth: 1900,
};
const out = {
  rank: 2,
  seatId: id(2),
  name: "Bo",
  controllerUserId: id(102),
  status: "resigned" as const,
  outRound: 4,
  cash: 0,
  properties: 0,
  netWorth: 0,
};
const result = {
  gameId: id(9),
  rounds: 5,
  winner: { seatId: id(1), name: "Ann" },
  finishedBy: null,
  standings: [winner, out],
};

describe("game result schemas", () => {
  test("accept a result and its response", () => {
    expect(gameResultSchema.parse(result)).toEqual(result);
    expect(gameResultResponseSchema.parse({ result })).toEqual({ result });
  });

  test("accept a game finished by the owner: no winner, players still in the game", () => {
    const inGame = { ...winner, status: "in_game" as const };
    const finished = {
      ...result,
      winner: null,
      finishedBy: "Ann",
      standings: [inGame, { ...inGame, rank: 2, seatId: id(3), netWorth: 900 }, out],
    };
    expect(gameResultSchema.parse(finished)).toEqual(finished);
    expect(standingSchema.parse({ ...inGame, outRound: null })).toEqual(inGame);
  });

  test("a result must say who finished it", () => {
    const { finishedBy: _finishedBy, ...withoutFinishedBy } = result;
    expect(gameResultSchema.safeParse(withoutFinishedBy).success).toBe(false);
    expect(gameResultSchema.safeParse({ ...result, finishedBy: 7 }).success).toBe(false);
  });

  test("reject an unknown status, a rank of 0 and a lone standing", () => {
    expect(standingSchema.safeParse({ ...out, status: "left" }).success).toBe(false);
    expect(standingSchema.safeParse({ ...out, rank: 0 }).success).toBe(false);
    expect(gameResultSchema.safeParse({ ...result, standings: [winner] }).success).toBe(false);
  });

  test("reject extra fields", () => {
    expect(gameResultSchema.safeParse({ ...result, extra: 1 }).success).toBe(false);
  });
});
