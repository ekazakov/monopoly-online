import { useState, type ReactNode } from "react";
import { RealtimeContext } from "./hooks.ts";
import { SseHttpClient } from "./SseHttpClient.ts";
import type { RealtimeClient } from "./types.ts";

/** Gives `client` to the tree. Without `client` it makes one `SseHttpClient`. */
export function RealtimeProvider({
  client,
  children,
}: {
  client?: RealtimeClient;
  children: ReactNode;
}) {
  const [fallback] = useState(() => (client ? null : new SseHttpClient()));
  return <RealtimeContext.Provider value={client ?? fallback}>{children}</RealtimeContext.Provider>;
}
