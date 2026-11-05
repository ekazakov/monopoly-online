import { describe, expect, test } from "vite-plus/test";
import { RoomError, toApiGame, withConflictRetry } from "./service.ts";

describe("withConflictRetry", () => {
  const unique = Object.assign(new Error("UNIQUE constraint failed"), {
    code: "SQLITE_CONSTRAINT_UNIQUE",
  });

  test("runs once when nothing fails", async () => {
    let calls = 0;
    expect(await withConflictRetry(async () => ++calls)).toBe(1);
  });

  test("runs again after a unique violation", async () => {
    let calls = 0;
    const result = await withConflictRetry(async () => {
      if (++calls === 1) throw unique;
      return "done";
    });
    expect([result, calls]).toEqual(["done", 2]);
  });

  test("a second violation is thrown", async () => {
    let calls = 0;
    await expect(
      withConflictRetry(async () => {
        calls++;
        throw unique;
      }),
    ).rejects.toBe(unique);
    expect(calls).toBe(2);
  });

  test("other errors are not retried", async () => {
    let calls = 0;
    const error = new RoomError("game_full", "full");
    await expect(
      withConflictRetry(async () => {
        calls++;
        throw error;
      }),
    ).rejects.toBe(error);
    expect(calls).toBe(1);
  });
});

describe("RoomError", () => {
  test("takes the HTTP status from the shared code", () => {
    expect(new RoomError("not_a_member", "x").status).toBe(403);
    expect(new RoomError("seat_name_taken", "x").status).toBe(409);
    expect(new RoomError("not_found", "x").status).toBe(404);
  });
});

describe("toApiGame", () => {
  test("orders the seats by seat_order", () => {
    const seat = (id: string, order: number) => ({
      id,
      game_id: "g",
      seat_order: order,
      name: id,
      name_key: id,
      kind: "hotseat" as const,
      user_id: null,
      controller_user_id: "u",
      token: "dog" as const,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const game = toApiGame(
      {
        id: "g",
        name: "G",
        owner_id: "u",
        status: "waiting",
        version: 0,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      [seat("c", 3), seat("a", 1), seat("b", 2)],
    );
    expect(game.seats.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });
});
