import type { ActionInput } from "@monopoly/shared";
import { createContext, useContext } from "react";
import type { ApiError } from "../api.ts";

/** The part of the screen that sent an action. An error of a source shows in that part only. */
export type ActionSource = "hand" | "menu";

export interface GameActions {
  /**
   * Send an engine action for the game on screen. `seatId` defaults to the seat that may act
   * now on this device. Resolves when the server accepted it; rejects with `ApiError` otherwise.
   */
  send(action: ActionInput, options?: { seatId?: string; source?: ActionSource }): Promise<void>;
  /** An action is on its way. Buttons that send actions are disabled meanwhile. */
  pending: boolean;
  /** The last rejected action, cleared by the next `send`. */
  error: ApiError | null;
  /** The `source` of the send that made `error`. Without it the turn area shows the error. */
  errorSource?: ActionSource | null;
}

// The real implementation (store + realtime client) is provided by the game route.
// Component tests provide a fake value.
export const GameActionsContext = createContext<GameActions | null>(null);

export function useGameActions(): GameActions {
  const actions = useContext(GameActionsContext);
  if (!actions) throw new Error("useGameActions needs a GameActionsContext provider");
  return actions;
}
