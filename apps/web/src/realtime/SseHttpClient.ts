import {
  actionResponseSchema,
  apiErrorSchema,
  streamMessageSchema,
  streamMessageTypes,
  type ActionResponse,
} from "@monopoly/shared";
import { ActionApiError } from "./errors.ts";
import type {
  MessageHandler,
  RealtimeClient,
  RealtimeStatus,
  SendRequest,
  Topic,
} from "./types.ts";

// The readyState values of EventSource. Fakes in tests do not have the static constants.
const CONNECTING = 0;
const CLOSED = 2;

export const RETRY_MIN_MS = 1_000;
export const RETRY_MAX_MS = 30_000;

/** The part of `EventSource` the client uses. */
export interface EventSourceLike {
  readonly readyState: number;
  onopen: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  close(): void;
}

export interface SseHttpClientOptions {
  eventSourceFactory?: (url: string) => EventSourceLike;
  fetch?: typeof fetch;
  /** Returns a number in [0, 1). Replace it in tests to fix the jitter. */
  random?: () => number;
  /** Gets every message that is dropped or fails: bad JSON, bad schema, a throwing handler. */
  onError?: (error: unknown) => void;
}

/** 1 s, 2 s, 4 s ... up to 30 s, then a random cut of up to half of it. */
export function retryDelay(attempt: number, random: () => number): number {
  const base = Math.min(RETRY_MAX_MS, RETRY_MIN_MS * 2 ** attempt);
  return Math.round(base * (0.5 + random() * 0.5));
}

interface Subscription {
  handler: MessageHandler;
}

export class SseHttpClient implements RealtimeClient {
  private readonly createSource: (url: string) => EventSourceLike;
  private readonly fetchImpl: typeof fetch;
  private readonly random: () => number;
  private readonly onError: (error: unknown) => void;

  private readonly subscriptions = new Map<Topic, Set<Subscription>>();
  private readonly statusListeners = new Set<(status: RealtimeStatus) => void>();
  private status: RealtimeStatus = "idle";
  private source: EventSourceLike | null = null;
  private openedTopics = "";
  private syncQueued = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;

  constructor(options: SseHttpClientOptions = {}) {
    this.createSource = options.eventSourceFactory ?? ((url) => new EventSource(url));
    this.fetchImpl = options.fetch ?? ((...args) => fetch(...args));
    this.random = options.random ?? Math.random;
    this.onError = options.onError ?? (() => {});
  }

  subscribe(topic: Topic, handler: MessageHandler): () => void {
    const subscription: Subscription = { handler };
    let set = this.subscriptions.get(topic);
    if (!set) this.subscriptions.set(topic, (set = new Set()));
    set.add(subscription);
    this.queueSync();

    return () => {
      const current = this.subscriptions.get(topic);
      if (!current?.delete(subscription)) return;
      if (current.size === 0) this.subscriptions.delete(topic);
      this.queueSync();
    };
  }

  getStatus(): RealtimeStatus {
    return this.status;
  }

  onStatusChange(listener: (status: RealtimeStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  /** Drops every subscription and the stream. A later `subscribe` opens a new stream. */
  close(): void {
    this.subscriptions.clear();
    this.teardown();
    this.setStatus("closed");
  }

  async send(request: SendRequest): Promise<ActionResponse> {
    const { gameId, seatId, action, expectedVersion, clientActionId } = request;
    const response = await this.fetchImpl(`/api/games/${encodeURIComponent(gameId)}/actions`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seatId, action, expectedVersion, clientActionId }),
    });
    const body: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(body);
      if (!parsed.success) {
        throw new ActionApiError(
          response.status,
          "internal_error",
          response.statusText || `HTTP ${response.status}`,
        );
      }
      const { code, message, issues, currentVersion } = parsed.data.error;
      throw new ActionApiError(response.status, code, message, issues, currentVersion);
    }

    const parsed = actionResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new ActionApiError(response.status, "internal_error", "Malformed action response");
    }
    return parsed.data;
  }

  private setStatus(status: RealtimeStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of [...this.statusListeners]) listener(status);
  }

  // Several subscribers in one tick (a React commit) share one stream change.
  private queueSync(): void {
    if (this.syncQueued) return;
    this.syncQueued = true;
    queueMicrotask(() => {
      this.syncQueued = false;
      this.sync();
    });
  }

  private sync(): void {
    const topics = [...this.subscriptions.keys()].sort().join(",");
    if (topics === "") {
      this.teardown();
      this.setStatus("idle");
      return;
    }
    if (topics === this.openedTopics && (this.source || this.retryTimer)) return;
    this.teardown();
    this.open(topics, "connecting");
  }

  private open(topics: string, status: RealtimeStatus): void {
    this.openedTopics = topics;
    this.setStatus(status);

    const source = this.createSource(`/api/stream?topics=${topics}`);
    this.source = source;
    source.onopen = () => {
      if (this.source !== source) return;
      this.attempt = 0;
      this.setStatus("open");
    };
    source.onerror = () => {
      if (this.source !== source) return;
      if (source.readyState === CONNECTING) {
        // The browser retries by itself and sends Last-Event-ID.
        this.setStatus("reconnecting");
      } else if (source.readyState === CLOSED) {
        this.setStatus("closed");
        this.scheduleRetry(source);
      }
    };
    for (const type of streamMessageTypes) {
      source.addEventListener(type, (event) => {
        if (this.source === source) this.receive(event.data);
      });
    }
  }

  // The browser gives up on a fatal error (bad status or content type). Open a new stream later.
  private scheduleRetry(source: EventSourceLike): void {
    source.close();
    this.source = null;
    const delay = retryDelay(this.attempt++, this.random);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      const topics = [...this.subscriptions.keys()].sort().join(",");
      if (topics === "") return;
      this.open(topics, "reconnecting");
    }, delay);
  }

  private teardown(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.source) {
      this.source.onopen = null;
      this.source.onerror = null;
      this.source.close();
    }
    this.source = null;
    this.openedTopics = "";
    this.attempt = 0;
  }

  private receive(data: unknown): void {
    let json: unknown;
    try {
      json = JSON.parse(String(data));
    } catch (error) {
      this.onError(error);
      return;
    }
    const parsed = streamMessageSchema.safeParse(json);
    if (!parsed.success) {
      this.onError(parsed.error);
      return;
    }
    for (const { handler } of [...(this.subscriptions.get(parsed.data.topic) ?? [])]) {
      try {
        handler(parsed.data);
      } catch (error) {
        this.onError(error);
      }
    }
  }
}
