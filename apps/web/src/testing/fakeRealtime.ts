import type { ActionResponse, StreamMessage } from "@monopoly/shared";
import { vi } from "vite-plus/test";
import type {
  MessageHandler,
  RealtimeClient,
  RealtimeStatus,
  SendRequest,
  Topic,
} from "../realtime/index.ts";

// A `RealtimeClient` for screen tests: `emit` plays a stream message, `setStatus` a transport
// change. `send` is a mock; set its answer with `send.mockResolvedValue` or `mockRejectedValue`.
export class FakeRealtimeClient implements RealtimeClient {
  readonly topics = new Map<Topic, Set<MessageHandler>>();
  readonly send = vi.fn<(request: SendRequest) => Promise<ActionResponse>>();
  private status: RealtimeStatus = "idle";
  private readonly listeners = new Set<(status: RealtimeStatus) => void>();

  subscribe(topic: Topic, handler: MessageHandler): () => void {
    const handlers = this.topics.get(topic) ?? new Set<MessageHandler>();
    this.topics.set(topic, handlers.add(handler));
    return () => {
      handlers.delete(handler);
    };
  }

  getStatus(): RealtimeStatus {
    return this.status;
  }

  onStatusChange(listener: (status: RealtimeStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setStatus(status: RealtimeStatus): void {
    this.status = status;
    for (const listener of [...this.listeners]) listener(status);
  }

  emit(message: StreamMessage): void {
    for (const handler of [...(this.topics.get(message.topic) ?? [])]) handler(message);
  }

  subscribed(topic: Topic): boolean {
    return (this.topics.get(topic)?.size ?? 0) > 0;
  }
}
