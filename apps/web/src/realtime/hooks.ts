import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { SseHttpClient } from "./SseHttpClient.ts";
import type { MessageHandler, RealtimeClient, RealtimeStatus, Topic } from "./types.ts";

export const RealtimeContext = createContext<RealtimeClient | null>(null);

let defaultClient: RealtimeClient | null = null;

/** Shared client for code that runs without a `RealtimeProvider`. */
function getDefaultClient(): RealtimeClient {
  return (defaultClient ??= new SseHttpClient());
}

export function useRealtimeClient(): RealtimeClient {
  return useContext(RealtimeContext) ?? getDefaultClient();
}

export function useRealtimeStatus(): RealtimeStatus {
  const client = useRealtimeClient();
  const subscribe = useCallback(
    (listener: () => void) => client.onStatusChange(listener),
    [client],
  );
  return useSyncExternalStore(subscribe, () => client.getStatus());
}

/** Subscribes while mounted. A null topic subscribes to nothing. The latest `handler` is called. */
export function useTopic(topic: Topic | null | undefined, handler: MessageHandler): void {
  const client = useRealtimeClient();
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    if (!topic) return;
    return client.subscribe(topic, (message) => latest.current(message));
  }, [client, topic]);
}
