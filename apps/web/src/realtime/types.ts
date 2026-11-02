import type { ActionRequest, ActionResponse, StreamMessage } from "@monopoly/shared";

export type RealtimeStatus = "idle" | "connecting" | "open" | "reconnecting" | "closed";

export type Topic = StreamMessage["topic"];

export type MessageHandler = (message: StreamMessage) => void;

/** `POST /api/games/:id/actions`: the path id plus the body. */
export type SendRequest = ActionRequest & { gameId: string };

export interface RealtimeClient {
  /** Returns the function that removes the subscription. */
  subscribe(topic: Topic, handler: MessageHandler): () => void;
  /** Rejects with `ActionApiError` when the server refuses; with the fetch error on a network failure. */
  send(request: SendRequest): Promise<ActionResponse>;
  getStatus(): RealtimeStatus;
  /** Returns the function that removes the listener. */
  onStatusChange(listener: (status: RealtimeStatus) => void): () => void;
}
