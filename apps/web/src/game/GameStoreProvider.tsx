import { useState } from "react";
import type { ReactNode } from "react";
import { GameStoreContext } from "./context.ts";
import { createGameStore } from "./store.ts";
import type { GameStore } from "./store.ts";

interface Props {
  /** A store made elsewhere, for example by the realtime client. The provider makes one if absent. */
  store?: GameStore;
  children: ReactNode;
}

export function GameStoreProvider({ store, children }: Props) {
  const [own] = useState(createGameStore);
  return <GameStoreContext value={store ?? own}>{children}</GameStoreContext>;
}
