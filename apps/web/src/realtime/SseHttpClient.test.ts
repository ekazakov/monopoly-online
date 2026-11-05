import { actionResponseSchema } from "@monopoly/shared";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { ActionApiError } from "./errors.ts";
import {
  actionResponse,
  FakeEventSource,
  gameActions,
  gameId,
  otherTopic,
  roomUpdated,
  topic,
} from "./fixtures.ts";
import { retryDelay, SseHttpClient, type SseHttpClientOptions } from "./SseHttpClient.ts";
import type { MessageHandler, RealtimeStatus, SendRequest } from "./types.ts";

// Subscriptions apply the stream change in a microtask.
const flush = () => Promise.resolve();

function setup(options: SseHttpClientOptions = {}) {
  const onError = vi.fn<(error: unknown) => void>();
  const client = new SseHttpClient({
    eventSourceFactory: (url) => new FakeEventSource(url),
    random: () => 0.5,
    onError,
    ...options,
  });
  const statuses: RealtimeStatus[] = [];
  client.onStatusChange((status) => statuses.push(status));
  const sources = FakeEventSource.instances;
  return { client, onError, statuses, sources, latest: () => sources[sources.length - 1]! };
}

beforeEach(() => {
  FakeEventSource.instances = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("stream lifecycle", () => {
  test("is idle and opens nothing without subscribers", async () => {
    const { client, sources } = setup();
    await flush();
    expect(client.getStatus()).toBe("idle");
    expect(sources).toHaveLength(0);
  });

  test("opens one stream for all topics, sorted, and registers the event names", async () => {
    const { client, sources, latest } = setup();
    client.subscribe(otherTopic, () => {});
    client.subscribe(topic, () => {});
    await flush();
    expect(sources).toHaveLength(1);
    expect(latest().url).toBe(`/api/stream?topics=${topic},${otherTopic}`);
    expect(latest().listenerTypes().sort()).toEqual([
      "game.actions",
      "invites.updated",
      "lobby.removed",
      "lobby.snapshot",
      "lobby.updated",
      "room.cancelled",
      "room.updated",
      "snapshot",
    ]);
    expect(client.getStatus()).toBe("connecting");
  });

  test("a second handler on the same topic keeps the stream", async () => {
    const { client, sources } = setup();
    client.subscribe(topic, () => {});
    await flush();
    const off = client.subscribe(topic, () => {});
    await flush();
    off();
    await flush();
    expect(sources).toHaveLength(1);
    expect(sources[0]!.closed).toBe(false);
  });

  test("a new topic reopens the stream and closes the old one", async () => {
    const { client, sources } = setup();
    client.subscribe(topic, () => {});
    await flush();
    sources[0]!.open();
    client.subscribe(otherTopic, () => {});
    await flush();
    expect(sources).toHaveLength(2);
    expect(sources[0]!.closed).toBe(true);
    expect(sources[1]!.url).toBe(`/api/stream?topics=${topic},${otherTopic}`);
    expect(client.getStatus()).toBe("connecting");
  });

  test("removing a topic reopens with the rest", async () => {
    const { client, sources } = setup();
    client.subscribe(topic, () => {});
    const off = client.subscribe(otherTopic, () => {});
    await flush();
    off();
    await flush();
    expect(sources).toHaveLength(2);
    expect(sources[1]!.url).toBe(`/api/stream?topics=${topic}`);
  });

  test("changes in one tick open one stream", async () => {
    const { client, sources } = setup();
    client.subscribe(topic, () => {});
    client.subscribe(otherTopic, () => {});
    await flush();
    expect(sources).toHaveLength(1);
  });

  test("unsubscribe and subscribe again in one tick keeps the stream", async () => {
    const { client, sources } = setup();
    const off = client.subscribe(topic, () => {});
    await flush();
    off();
    client.subscribe(topic, () => {});
    await flush();
    expect(sources).toHaveLength(1);
    expect(sources[0]!.closed).toBe(false);
  });

  test("closes the stream when the last subscriber leaves", async () => {
    const { client, sources, statuses } = setup();
    const off = client.subscribe(topic, () => {});
    await flush();
    sources[0]!.open();
    off();
    off();
    await flush();
    expect(sources[0]!.closed).toBe(true);
    expect(client.getStatus()).toBe("idle");
    expect(statuses).toEqual(["connecting", "open", "idle"]);
  });

  test("close() drops everything; a later subscribe opens a new stream", async () => {
    const { client, sources } = setup();
    const handler = vi.fn<MessageHandler>();
    client.subscribe(topic, handler);
    await flush();
    client.close();
    expect(sources[0]!.closed).toBe(true);
    expect(client.getStatus()).toBe("closed");
    client.subscribe(topic, handler);
    await flush();
    expect(sources).toHaveLength(2);
    expect(client.getStatus()).toBe("connecting");
  });
});

describe("messages", () => {
  test("parses a message and gives it to the handlers of its topic only", async () => {
    const { client, latest } = setup();
    const a = vi.fn<MessageHandler>();
    const b = vi.fn<MessageHandler>();
    client.subscribe(topic, a);
    client.subscribe(otherTopic, b);
    await flush();

    latest().emit("room.updated", roomUpdated());
    latest().emit("game.actions", gameActions(otherTopic));

    expect(a).toHaveBeenCalledTimes(1);
    expect(a.mock.calls[0]![0].type).toBe("room.updated");
    expect(b).toHaveBeenCalledTimes(1);
    expect(b.mock.calls[0]![0].type).toBe("game.actions");
  });

  test("a removed handler gets nothing", async () => {
    const { client, latest } = setup();
    const handler = vi.fn<MessageHandler>();
    client.subscribe(otherTopic, () => {});
    const off = client.subscribe(topic, handler);
    await flush();
    off();
    latest().emit("room.updated", roomUpdated());
    expect(handler).not.toHaveBeenCalled();
  });

  test("drops invalid JSON and reports it", async () => {
    const { client, latest, onError } = setup();
    const handler = vi.fn<MessageHandler>();
    client.subscribe(topic, handler);
    await flush();
    latest().emit("snapshot", "{not json");
    expect(handler).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  test("drops messages that fail the schema and reports them", async () => {
    const { client, latest, onError } = setup();
    const handler = vi.fn<MessageHandler>();
    client.subscribe(topic, handler);
    await flush();
    latest().emit("room.updated", { ...roomUpdated(), payload: { events: [] } });
    latest().emit("room.updated", { ...roomUpdated(), topic: "user:1" });
    latest().emit("room.updated", null);
    expect(handler).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(3);
  });

  test("a throwing handler does not stop the others", async () => {
    const { client, latest, onError } = setup();
    const boom = new Error("boom");
    const next = vi.fn<MessageHandler>();
    client.subscribe(topic, () => {
      throw boom;
    });
    client.subscribe(topic, next);
    await flush();
    latest().emit("room.updated", roomUpdated());
    expect(next).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(boom);
  });
});

describe("status", () => {
  test("connecting, open, reconnecting while the browser retries, open again", async () => {
    const { client, sources, statuses } = setup();
    client.subscribe(topic, () => {});
    await flush();
    sources[0]!.open();
    sources[0]!.dropAndRetry();
    sources[0]!.open();
    expect(statuses).toEqual(["connecting", "open", "reconnecting", "open"]);
    expect(sources).toHaveLength(1);
  });

  test("closed on a fatal error, then a new stream after the backoff", async () => {
    vi.useFakeTimers();
    const { client, sources, statuses } = setup();
    client.subscribe(topic, () => {});
    await vi.advanceTimersByTimeAsync(0);
    sources[0]!.fail();
    expect(client.getStatus()).toBe("closed");
    expect(sources[0]!.closed).toBe(true);

    // random() = 0.5 gives 75 % of the base delay: 750 ms.
    await vi.advanceTimersByTimeAsync(749);
    expect(sources).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sources).toHaveLength(2);
    expect(sources[1]!.url).toBe(sources[0]!.url);
    expect(client.getStatus()).toBe("reconnecting");

    sources[1]!.open();
    expect(statuses).toEqual(["connecting", "closed", "reconnecting", "open"]);
  });

  test("the backoff grows with each failure and resets after open", async () => {
    vi.useFakeTimers();
    const { client, sources } = setup({ random: () => 0.999999 });
    client.subscribe(topic, () => {});
    await vi.advanceTimersByTimeAsync(0);
    sources[0]!.fail();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sources).toHaveLength(2);
    sources[1]!.fail();
    await vi.advanceTimersByTimeAsync(1_999);
    expect(sources).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sources).toHaveLength(3);
    sources[2]!.open();
    sources[2]!.fail();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sources).toHaveLength(4);
  });

  test("leaving during the backoff cancels the retry", async () => {
    vi.useFakeTimers();
    const { client, sources } = setup();
    const off = client.subscribe(topic, () => {});
    await vi.advanceTimersByTimeAsync(0);
    sources[0]!.fail();
    off();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sources).toHaveLength(1);
    expect(client.getStatus()).toBe("idle");
  });

  test("a status listener can leave", async () => {
    const { client, sources } = setup();
    const listener = vi.fn<(status: RealtimeStatus) => void>();
    const off = client.onStatusChange(listener);
    client.subscribe(topic, () => {});
    await flush();
    expect(listener).toHaveBeenCalledWith("connecting");
    off();
    sources[0]!.open();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("retryDelay", () => {
  test("doubles from 1 s up to 30 s, with jitter between 50 % and 100 %", () => {
    expect(retryDelay(0, () => 0.999999)).toBe(1_000);
    expect(retryDelay(0, () => 0)).toBe(500);
    expect(retryDelay(3, () => 0.999999)).toBe(8_000);
    expect(retryDelay(10, () => 0.999999)).toBe(30_000);
    expect(retryDelay(10, () => 0)).toBe(15_000);
  });
});

describe("send", () => {
  const request: SendRequest = {
    gameId,
    seatId: "00000000-0000-4000-8000-000000000201",
    action: { type: "RollDice" },
    expectedVersion: 1,
    clientActionId: "00000000-0000-4000-8000-000000000301",
  };

  const errorBody = (error: Record<string, unknown>) => ({ error });

  test("POSTs the body without gameId and returns the parsed response", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(actionResponse));
    const { client } = setup({ fetch });
    const result = await client.send(request);

    expect(result).toEqual(actionResponseSchema.parse(actionResponse));
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/games/${gameId}/actions`);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({
      seatId: request.seatId,
      action: request.action,
      expectedVersion: 1,
      clientActionId: request.clientActionId,
    });
  });

  test("409 version_conflict carries currentVersion", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        errorBody({ code: "version_conflict", message: "Stale version", currentVersion: 4 }),
        { status: 409 },
      ),
    );
    const { client } = setup({ fetch });
    const error = await client.send(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ActionApiError);
    expect(error).toMatchObject({
      name: "ApiError",
      status: 409,
      code: "version_conflict",
      currentVersion: 4,
    });
  });

  test("422 engine error keeps its code", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(errorBody({ code: "not_your_turn", message: "Not your turn" }), {
        status: 422,
      }),
    );
    const { client } = setup({ fetch });
    const error = await client.send(request).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 422, code: "not_your_turn", message: "Not your turn" });
    expect((error as ActionApiError).currentVersion).toBeUndefined();
  });

  test("an error body that is not an API error becomes internal_error", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response("<html>", { status: 502, statusText: "Bad Gateway" }),
    );
    const { client } = setup({ fetch });
    await expect(client.send(request)).rejects.toMatchObject({
      status: 502,
      code: "internal_error",
      message: "Bad Gateway",
    });
  });

  test("a success body that fails the schema is an error", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ version: 1 }));
    const { client } = setup({ fetch });
    await expect(client.send(request)).rejects.toMatchObject({ code: "internal_error" });
  });

  test("a network error passes through", async () => {
    const failure = new TypeError("Failed to fetch");
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw failure;
    });
    const { client } = setup({ fetch });
    await expect(client.send(request)).rejects.toBe(failure);
  });
});
