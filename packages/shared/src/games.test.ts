import { describe, expect, test } from "vite-plus/test";
import {
  actionRequestSchema,
  actionResponseSchema,
  createGameSchema,
  createSeatSchema,
  gameSchema,
  gameStateResponseSchema,
  gameStatusSchema,
  MAX_SEATS,
  RESUME_MAX_GAP,
  seatNameSchema,
  seatSchema,
  startGameResponseSchema,
} from "./index.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const seat = (n: number) => ({
  id: id(n),
  order: n,
  name: `Seat ${n}`,
  kind: "user" as const,
  userId: id(100 + n),
  controllerUserId: id(100 + n),
});

const game = {
  id: id(1),
  name: "Friday night",
  status: "waiting" as const,
  ownerId: id(101),
  version: 0,
  createdAt: "2026-11-02T10:00:00.000Z",
  seats: [seat(1), seat(2)],
};

const state = {
  version: 0,
  players: [
    {
      id: id(1),
      name: "Ann",
      cash: 1500,
      position: 0,
      inJail: false,
      jailTurns: 0,
      heldJailCards: [],
      active: true,
    },
  ],
  ownership: {},
  turn: { currentPlayerId: id(1), phase: "awaiting_roll", doubles: 0, dice: null },
  debts: [],
  auction: null,
  trade: null,
};

describe("constants", () => {
  test("limits", () => {
    expect(MAX_SEATS).toBe(6);
    expect(RESUME_MAX_GAP).toBe(100);
  });
});

describe("createGameSchema", () => {
  test("trims the name and keeps 1 to 60 characters", () => {
    expect(createGameSchema.parse({ name: "  Home  " })).toEqual({ name: "Home" });
    expect(createGameSchema.safeParse({ name: "a".repeat(60) }).success).toBe(true);
    expect(createGameSchema.safeParse({ name: "a".repeat(61) }).success).toBe(false);
    expect(createGameSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  test("is strict: no seatLimit", () => {
    expect(createGameSchema.safeParse({ name: "Home", seatLimit: 4 }).success).toBe(false);
  });
});

describe("seats", () => {
  test("seat names follow the display name rule", () => {
    expect(seatNameSchema.parse(" Bo ")).toBe("Bo");
    expect(seatNameSchema.safeParse("B").success).toBe(false);
    expect(seatNameSchema.safeParse("a".repeat(17)).success).toBe(false);
    expect(createSeatSchema.parse({ name: " Cy " })).toEqual({ name: "Cy" });
    expect(createSeatSchema.safeParse({ name: "Cy", kind: "user" }).success).toBe(false);
  });

  test("a hot-seat seat has no user", () => {
    const hotseat = { ...seat(3), kind: "hotseat" as const, userId: null };
    expect(seatSchema.parse(hotseat)).toEqual(hotseat);
    expect(seatSchema.safeParse({ ...seat(3), kind: "bot" }).success).toBe(false);
  });
});

describe("gameSchema", () => {
  test("parses a room", () => {
    expect(gameSchema.parse(game)).toEqual(game);
  });

  test("knows the four statuses", () => {
    expect(gameStatusSchema.options).toEqual(["waiting", "active", "saved", "finished"]);
  });

  test("refuses more than MAX_SEATS seats and unknown keys", () => {
    const seats = Array.from({ length: MAX_SEATS + 1 }, (_, i) => seat(i + 1));
    expect(gameSchema.safeParse({ ...game, seats }).success).toBe(false);
    expect(gameSchema.safeParse({ ...game, seatLimit: 6 }).success).toBe(false);
  });
});

describe("action request", () => {
  const request = {
    seatId: id(1),
    action: { type: "Build", square: 1 },
    expectedVersion: 3,
    clientActionId: id(9),
  };

  test("parses a request", () => {
    expect(actionRequestSchema.parse(request)).toEqual(request);
  });

  test("refuses playerId, bad versions and bad ids", () => {
    const bad = (patch: object) => actionRequestSchema.safeParse({ ...request, ...patch }).success;
    expect(bad({ action: { type: "Build", square: 1, playerId: "x" } })).toBe(false);
    expect(bad({ action: { type: "Build", square: 40 } })).toBe(false);
    expect(bad({ action: { type: "Fly" } })).toBe(false);
    expect(bad({ expectedVersion: -1 })).toBe(false);
    expect(bad({ expectedVersion: 1.5 })).toBe(false);
    expect(bad({ clientActionId: "abc" })).toBe(false);
    expect(bad({ seatId: "abc" })).toBe(false);
    expect(bad({ extra: true })).toBe(false);
  });
});

describe("responses", () => {
  test("start and state responses carry the redacted state", () => {
    expect(startGameResponseSchema.parse({ game, state })).toEqual({ game, state });
    expect(gameStateResponseSchema.parse({ version: 0, state })).toEqual({ version: 0, state });
    expect(
      startGameResponseSchema.safeParse({ game, state: { ...state, rng: { seed: 1 } } }).success,
    ).toBe(false);
  });

  test("an action response carries events and the state", () => {
    const body = {
      version: 1,
      events: [{ type: "DiceRolled", playerId: id(1), dice: [3, 4] }],
      state: { ...state, version: 1 },
    };
    expect(actionResponseSchema.parse(body)).toEqual(body);
    expect(actionResponseSchema.safeParse({ ...body, events: [{ type: "Nope" }] }).success).toBe(
      false,
    );
  });
});
