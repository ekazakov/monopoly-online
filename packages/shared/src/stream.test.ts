import { describe, expect, test } from "vite-plus/test";
import {
  MAX_STREAM_TOPICS,
  parseStreamTopics,
  streamEnvelopeSchema,
  streamMessageSchema,
} from "./index.ts";

const gameId = "00000000-0000-4000-8000-000000000001";
const topic = `game:${gameId}`;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const game = {
  id: gameId,
  name: "Friday night",
  status: "waiting",
  ownerId: "00000000-0000-4000-8000-000000000101",
  version: 0,
  createdAt: "2026-11-02T10:00:00.000Z",
  seats: [],
  invites: [],
};

const state = {
  version: 1,
  players: [],
  ownership: {},
  turn: { currentPlayerId: "a", phase: "awaiting_roll", doubles: 0, dice: null },
  debts: [],
  auction: null,
  trade: null,
};

describe("stream envelope", () => {
  test("accepts any payload", () => {
    const envelope = { topic, type: "room.updated", version: 0, payload: { anything: 1 } };
    expect(streamEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });

  test("refuses a bad topic, an unknown type and extra keys", () => {
    const envelope = { topic, type: "snapshot", version: 0, payload: null };
    expect(streamEnvelopeSchema.safeParse({ ...envelope, topic: "game:1" }).success).toBe(false);
    expect(streamEnvelopeSchema.safeParse({ ...envelope, topic: "user:1" }).success).toBe(false);
    expect(streamEnvelopeSchema.safeParse({ ...envelope, type: "ping" }).success).toBe(false);
    expect(streamEnvelopeSchema.safeParse({ ...envelope, id: 1 }).success).toBe(false);
  });
});

describe("stream messages", () => {
  test("snapshot with a null state while waiting", () => {
    const message = { topic, type: "snapshot", version: 0, payload: { game, state: null } };
    expect(streamMessageSchema.parse(message)).toEqual(message);
  });

  test("snapshot with a state", () => {
    const message = {
      topic,
      type: "snapshot",
      version: 1,
      payload: { game: { ...game, status: "active", version: 1 }, state },
    };
    expect(streamMessageSchema.parse(message)).toEqual(message);
  });

  test("room.updated", () => {
    const message = { topic, type: "room.updated", version: 0, payload: { game } };
    expect(streamMessageSchema.parse(message)).toEqual(message);
  });

  test("game.actions", () => {
    const message = {
      topic,
      type: "game.actions",
      version: 1,
      payload: { events: [{ type: "TurnEnded", playerId: "a", nextPlayerId: "b" }], state },
    };
    expect(streamMessageSchema.parse(message)).toEqual(message);
  });

  test("presence.updated", () => {
    const seats = { [id(1)]: "online", [id(2)]: "reconnecting", [id(3)]: "away" };
    const message = { topic, type: "presence.updated", version: 0, payload: { seats } };
    expect(streamMessageSchema.parse(message)).toEqual(message);
    expect(streamMessageSchema.safeParse({ ...message, payload: { seats: {} } }).success).toBe(
      true,
    );
    expect(
      streamMessageSchema.safeParse({ ...message, payload: { seats: { [id(1)]: "gone" } } })
        .success,
    ).toBe(false);
    expect(
      streamMessageSchema.safeParse({ ...message, payload: { seats: { nope: "online" } } }).success,
    ).toBe(false);
  });

  test("the payload must match the type", () => {
    const message = { topic, type: "room.updated", version: 0, payload: { events: [], state } };
    expect(streamMessageSchema.safeParse(message).success).toBe(false);
    expect(streamMessageSchema.safeParse({ ...message, type: "game.actions" }).success).toBe(true);
    expect(streamMessageSchema.safeParse({ ...message, type: "ping" }).success).toBe(false);
  });
});

describe("parseStreamTopics", () => {
  test("splits a comma list of game topics", () => {
    expect(parseStreamTopics(topic)).toEqual([topic]);
    const other = "game:00000000-0000-4000-8000-000000000002";
    expect(parseStreamTopics(`${topic},${other}`)).toEqual([topic, other]);
  });

  test("refuses empty, bad and too many topics", () => {
    expect(parseStreamTopics("")).toBeNull();
    expect(parseStreamTopics("user:1")).toBeNull();
    expect(parseStreamTopics(`${topic},`)).toBeNull();
    const many = Array.from({ length: MAX_STREAM_TOPICS + 1 }, () => topic).join(",");
    expect(parseStreamTopics(many)).toBeNull();
    expect(
      parseStreamTopics(Array.from({ length: MAX_STREAM_TOPICS }, () => topic).join(",")),
    ).not.toBeNull();
  });
});
