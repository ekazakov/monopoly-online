import type { ActionInput } from "@monopoly/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../api.ts";
import { currentLanguage, translate } from "../i18n/index.ts";
import { ActionApiError, useRealtimeClient } from "../realtime/index.ts";
import type { ActionSource, GameActions } from "./actions.ts";
import { seatThatMayAct } from "./selectors.ts";
import { useGameStore } from "./useGame.ts";

interface Attempt {
  /** The request without the id: a retry of the same request keeps the id. */
  fingerprint: string;
  clientActionId: string;
}

// Status 0 means that no answer came, so the message is made here and not by the server.
const networkError = () =>
  new ApiError(0, "internal_error", translate(currentLanguage(), "error.network"));

/**
 * The real `GameActions` for the game route: sends through the realtime client with the store
 * version, and puts the accepted response into the store. One action is in flight at a time.
 * After a network failure the next send of the same request reuses its `clientActionId`, so the
 * server answers a repeat and does not play it twice. `onVersionConflict` runs on a 409
 * `version_conflict`; the route refetches the state there.
 */
export function useGameActionsProvider(
  gameId: string,
  userId: string | null,
  onVersionConflict?: () => void,
): GameActions {
  const store = useGameStore();
  const client = useRealtimeClient();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<{ error: ApiError; source: ActionSource | null } | null>(
    null,
  );
  const inFlight = useRef(false);
  const attempt = useRef<Attempt | null>(null);
  const conflict = useRef(onVersionConflict);
  useEffect(() => {
    conflict.current = onVersionConflict;
  });

  const send = useCallback<GameActions["send"]>(
    async (action: ActionInput, options = {}) => {
      if (inFlight.current) return;
      const { game, state, version } = store.getState();
      const seatId = options.seatId ?? seatThatMayAct(game, state, userId, action.type)?.id;
      setFailure(null);
      if (!seatId) {
        const error = new ApiError(
          403,
          "not_your_seat",
          translate(currentLanguage(), "error.noSeat"),
        );
        setFailure({ error, source: options.source ?? null });
        throw error;
      }

      const fingerprint = JSON.stringify([seatId, action, version]);
      const clientActionId =
        attempt.current?.fingerprint === fingerprint
          ? attempt.current.clientActionId
          : crypto.randomUUID();

      inFlight.current = true;
      setPending(true);
      try {
        const response = await client.send({
          gameId,
          seatId,
          action,
          expectedVersion: version,
          clientActionId,
        });
        attempt.current = null;
        store.applyActionResponse(response);
      } catch (cause) {
        let error: ApiError;
        if (cause instanceof ApiError) {
          attempt.current = null;
          error = cause;
          if (cause instanceof ActionApiError && cause.code === "version_conflict") {
            conflict.current?.();
          }
        } else {
          attempt.current = { fingerprint, clientActionId };
          error = networkError();
        }
        setFailure({ error, source: options.source ?? null });
        throw error;
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [client, gameId, store, userId],
  );

  return useMemo(
    () => ({
      send,
      pending,
      error: failure?.error ?? null,
      errorSource: failure?.source ?? null,
    }),
    [send, pending, failure],
  );
}
