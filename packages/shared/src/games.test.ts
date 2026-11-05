import { describe, expect, test } from "vite-plus/test";
import {
  actionRequestSchema,
  actionResponseSchema,
  createGameSchema,
  createSeatSchema,
  gameSchema,
  gameStateResponseSchema,
  gameStatusSchema,
  inviteSchema,
  inviteStateSchema,
  lobbyGameSchema,
  MAX_SEATS,
  RESUME_MAX_GAP,
  seatNameSchema,
  seatSchema,
  startGameResponseSchema,
  tokenSchema,
  TOKENS,
} from "./index.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const seat = (n: number) => ({
  id: id(n),
  order: n,
  name: `Seat ${n}`,
  kind: "user" as const,
  userId: id(100 + n),
  controllerUserId: id(100 + n),
  token: TOKENS[n - 1]!,
});

const game = {
  id: id(1),
  name: "Friday night",
  status: "waiting" as const,
  ownerId: id(101),
  version: 0,
  createdAt: "2026-11-02T10:00:00.000Z",
  seats: [seat(1), seat(2)],
  invites: [],
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

describe("tokens", () => {
  test("there is one token for each seat, in the free-token order", () => {
    expect(TOKENS).toEqual(["dog", "cat", "penguin", "car", "horse", "duck"]);
    expect(TOKENS).toHaveLength(MAX_SEATS);
    expect(tokenSchema.options).toEqual([...TOKENS]);
  });

  test("an unknown token is refused", () => {
    expect(tokenSchema.safeParse("hat").success).toBe(false);
    expect(seatSchema.safeParse({ ...seat(1), token: "hat" }).success).toBe(false);
    const { token: _token, ...withoutToken } = seat(1);
    expect(seatSchema.safeParse(withoutToken).success).toBe(false);
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

  test("lists the invites for the host", () => {
    const invites = [{ id: id(50), userId: id(150), name: "Cy", state: "pending" as const }];
    expect(gameSchema.parse({ ...game, invites })).toEqual({ ...game, invites });
    expect(
      gameSchema.safeParse({ ...game, invites: [{ id: id(50), userId: id(150) }] }).success,
    ).toBe(false);
    const { invites: _invites, ...withoutInvites } = game;
    expect(gameSchema.safeParse(withoutInvites).success).toBe(false);
  });

  test("refuses more than MAX_SEATS seats and unknown keys", () => {
    const seats = Array.from({ length: MAX_SEATS + 1 }, (_, i) => seat(i + 1));
    expect(gameSchema.safeParse({ ...game, seats }).success).toBe(false);
    expect(gameSchema.safeParse({ ...game, seatLimit: 6 }).success).toBe(false);
  });
});

describe("lobby", () => {
  const lobbyGame = {
    id: id(1),
    name: "Friday night",
    ownerName: "Ann",
    status: "waiting" as const,
    seatCount: 2,
    tokens: ["dog", "cat"] as const,
    createdAt: "2026-11-02T10:00:00.000Z",
  };
  const invite = {
    id: id(60),
    gameId: id(1),
    gameName: "Friday night",
    hostName: "Ann",
    state: "pending" as const,
    createdAt: "2026-11-02T10:05:00.000Z",
  };

  test("an invite has four states", () => {
    expect(inviteStateSchema.options).toEqual(["pending", "accepted", "declined", "expired"]);
  });

  test("lobbyGameSchema parses a row and refuses 7 seats or a bad token", () => {
    expect(lobbyGameSchema.parse(lobbyGame)).toEqual(lobbyGame);
    expect(lobbyGameSchema.safeParse({ ...lobbyGame, seatCount: MAX_SEATS + 1 }).success).toBe(
      false,
    );
    expect(lobbyGameSchema.safeParse({ ...lobbyGame, tokens: ["hat"] }).success).toBe(false);
    expect(lobbyGameSchema.safeParse({ ...lobbyGame, extra: 1 }).success).toBe(false);
  });

  test("inviteSchema parses an invite and refuses an unknown state", () => {
    expect(inviteSchema.parse(invite)).toEqual(invite);
    expect(inviteSchema.safeParse({ ...invite, state: "cancelled" }).success).toBe(false);
    expect(inviteSchema.safeParse({ ...invite, gameId: "abc" }).success).toBe(false);
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
