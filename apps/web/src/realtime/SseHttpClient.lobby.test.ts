import type { StreamMessage } from "@monopoly/shared";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { FakeEventSource, gameId, roomUpdated, topic } from "./fixtures.ts";
import { SseHttpClient } from "./SseHttpClient.ts";
import type { MessageHandler, Topic } from "./types.ts";

// The real client with the three kinds of topic on one EventSource: a game, the lobby and the
// invites of a user. The server sends no SSE id for the last two.
const userId = "0b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d01";
const lobby = "lobby" as const;
const user = `user:${userId}` as const;
const flush = () => Promise.resolve();

const lobbyGame = {
  id: gameId,
  name: "Friday game",
  ownerId: "00000000-0000-4000-8000-000000000001",
  ownerName: "Ann",
  status: "waiting" as const,
  seatCount: 2,
  tokens: ["dog", "cat"] as ("dog" | "cat")[],
  createdAt: "2026-11-02T10:00:00.000Z",
};
const msg = (t: Topic, type: string, payload: unknown): StreamMessage =>
  ({ topic: t, type, version: 0, payload }) as StreamMessage;

function setup() {
  const onError = vi.fn<(error: unknown) => void>();
  const client = new SseHttpClient({
    eventSourceFactory: (url) => new FakeEventSource(url),
    random: () => 0.5,
    onError,
  });
  return { client, onError, sources: FakeEventSource.instances };
}

beforeEach(() => {
  FakeEventSource.instances = [];
});

describe("lobby and user topics", () => {
  test("share one stream with a game topic, sorted", async () => {
    const { client, sources } = setup();
    client.subscribe(user, () => {});
    client.subscribe(lobby, () => {});
    client.subscribe(topic, () => {});
    await flush();
    expect(sources).toHaveLength(1);
    expect(sources[0]!.url).toBe(`/api/stream?topics=${topic},${lobby},${user}`);
  });

  test("each message goes to the handlers of its own topic only", async () => {
    const { client, sources } = setup();
    const onLobby = vi.fn<MessageHandler>();
    const onUser = vi.fn<MessageHandler>();
    const onGame = vi.fn<MessageHandler>();
    client.subscribe(lobby, onLobby);
    client.subscribe(user, onUser);
    client.subscribe(topic, onGame);
    await flush();
    const source = sources[0]!;

    source.emit("lobby.snapshot", msg(lobby, "lobby.snapshot", { games: [lobbyGame] }));
    source.emit("lobby.updated", msg(lobby, "lobby.updated", { game: lobbyGame }));
    source.emit("lobby.removed", msg(lobby, "lobby.removed", { gameId }));
    source.emit("invites.updated", msg(user, "invites.updated", { invites: [] }));
    source.emit("room.updated", roomUpdated());

    expect(onLobby.mock.calls.map(([m]) => m.type)).toEqual([
      "lobby.snapshot",
      "lobby.updated",
      "lobby.removed",
    ]);
    expect(onUser.mock.calls.map(([m]) => m.type)).toEqual(["invites.updated"]);
    expect(onGame.mock.calls.map(([m]) => m.type)).toEqual(["room.updated"]);
  });

  test("a room.cancelled reaches the game topic; dropping it reopens with the other two", async () => {
    const { client, sources } = setup();
    const onGame = vi.fn<MessageHandler>();
    client.subscribe(lobby, () => {});
    const off = client.subscribe(topic, onGame);
    await flush();

    sources[0]!.emit("room.cancelled", msg(topic, "room.cancelled", { gameId }));
    expect(onGame.mock.calls.map(([m]) => m.type)).toEqual(["room.cancelled"]);

    // The screen drops the topic after the notice: no stream asks for the deleted game again.
    off();
    await flush();
    expect(sources).toHaveLength(2);
    expect(sources[0]!.closed).toBe(true);
    expect(sources[1]!.url).toBe(`/api/stream?topics=${lobby}`);
  });

  test("a lobby message with a bad payload is dropped and reported", async () => {
    const { client, sources, onError } = setup();
    const onLobby = vi.fn<MessageHandler>();
    client.subscribe(lobby, onLobby);
    await flush();
    sources[0]!.emit(
      "lobby.updated",
      msg(lobby, "lobby.updated", { game: { ...lobbyGame, seatCount: 7 } }),
    );
    expect(onLobby).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  test("a user topic message cannot arrive on the lobby topic", async () => {
    const { client, sources } = setup();
    const onLobby = vi.fn<MessageHandler>();
    client.subscribe(lobby, onLobby);
    await flush();
    sources[0]!.emit("invites.updated", msg(user, "invites.updated", { invites: [] }));
    expect(onLobby).not.toHaveBeenCalled();
  });
});
