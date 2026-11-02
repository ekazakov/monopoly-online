import type { ActionInput } from "@monopoly/shared";
import { createContext, useContext } from "react";
import type { ApiError } from "../api.ts";

export interface GameActions {
  /**
   * Send an engine action for the game on screen. `seatId` defaults to the seat that may act
   * now on this device. Resolves when the server accepted it; rejects with `ApiError` otherwise.
   */
  send(action: ActionInput, options?: { seatId?: string }): Promise<void>;
  /** An action is on its way. Buttons that send actions are disabled meanwhile. */
  pending: boolean;
  /** The last rejected action, cleared by the next `send`. */
  error: ApiError | null;
}

// The real implementation (store + realtime client) is provided by the game route.
// Component tests provide a fake value.
export const GameActionsContext = createContext<GameActions | null>(null);

export function useGameActions(): GameActions {
  const actions = useContext(GameActionsContext);
  if (!actions) throw new Error("useGameActions needs a GameActionsContext provider");
  return actions;
}
