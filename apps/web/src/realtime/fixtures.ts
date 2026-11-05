import type { EventSourceLike } from "./SseHttpClient.ts";

export const gameId = "00000000-0000-4000-8000-000000000001";
export const otherGameId = "00000000-0000-4000-8000-000000000002";
export const topic = `game:${gameId}` as const;
export const otherTopic = `game:${otherGameId}` as const;

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

export const state = {
  version: 1,
  players: [],
  ownership: {},
  turn: { currentPlayerId: "a", phase: "awaiting_roll", doubles: 0, dice: null },
  debts: [],
  auction: null,
  trade: null,
};

export const roomUpdated = (t: string = topic) => ({
  topic: t,
  type: "room.updated",
  version: 0,
  payload: { game },
});

export const gameActions = (t: string = topic) => ({
  topic: t,
  type: "game.actions",
  version: 1,
  payload: { events: [{ type: "TurnEnded", playerId: "a", nextPlayerId: "b" }], state },
});

export const actionResponse = {
  version: 1,
  events: [{ type: "TurnEnded", playerId: "a", nextPlayerId: "b" }],
  state,
};

export class FakeEventSource implements EventSourceLike {
  static instances: FakeEventSource[] = [];

  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;
  private readonly listeners = new Map<string, ((event: MessageEvent) => void)[]>();

  readonly url: string;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close(): void {
    this.closed = true;
    this.readyState = 2;
  }

  listenerTypes(): string[] {
    return [...this.listeners.keys()];
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  /** The browser lost the connection and retries by itself. */
  dropAndRetry(): void {
    this.readyState = 0;
    this.onerror?.(new Event("error"));
  }

  /** The browser gave up. */
  fail(): void {
    this.readyState = 2;
    this.onerror?.(new Event("error"));
  }

  emit(type: string, data: unknown): void {
    const text = typeof data === "string" ? data : JSON.stringify(data);
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new MessageEvent(type, { data: text }));
    }
  }
}
