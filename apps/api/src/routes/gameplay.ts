// Gameplay routes: submit an action and read the redacted state. The domain rules live in
// `game/service.ts`; the handlers map its `GameServiceError` to the shared error body.
// Mount with `.route("/", createGameplayRoutes(deps))`, or build the service first (the realtime
// layer needs it for `onCommitted`) and use `gameplayRoutes({ ...deps, service })`.
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import {
  actionRequestSchema,
  actionResponseSchema,
  gameParamsSchema,
  gameStateResponseSchema,
} from "@monopoly/shared";
import type { ApiErrorBody } from "@monopoly/shared";
import { createGameStateLoader } from "../game/loader.ts";
import type { GameStateLoader } from "../game/loader.ts";
import { GameServiceError, createGameService } from "../game/service.ts";
import type { GameService, GameServiceOptions } from "../game/service.ts";
import {
  errorResponses,
  jsonBody,
  jsonResponse,
  sessionSecurity,
  type AppDeps,
  type AppEnv,
} from "./common.ts";

const actionsRoute = createRoute({
  ...sessionSecurity,
  method: "post",
  path: "/games/{id}/actions",
  tags: ["games"],
  summary: "Submit an action for a seat",
  description:
    "The server sets `playerId` from `seatId`. A repeat of the same `clientActionId` returns the stored `version` and `events` with the current `state`.",
  request: { params: gameParamsSchema, body: jsonBody(actionRequestSchema) },
  responses: {
    200: jsonResponse("The action was accepted", actionResponseSchema),
    ...errorResponses(400, 401, 403, 404, 409, 422, 500),
  },
});

const stateRoute = createRoute({
  ...sessionSecurity,
  method: "get",
  path: "/games/{id}/state",
  tags: ["games"],
  summary: "Read the redacted game state",
  description: "For `active` and `finished` games. A game that is still `waiting` has no state.",
  request: { params: gameParamsSchema },
  responses: {
    200: jsonResponse("The state with its version", gameStateResponseSchema),
    ...errorResponses(400, 401, 403, 404, 409, 500),
  },
});

function toErrorBody(error: GameServiceError): ApiErrorBody {
  const { code, message, currentVersion } = error;
  return {
    error: currentVersion === undefined ? { code, message } : { code, message, currentVersion },
  };
}

export function gameplayRoutes(deps: AppDeps & { service: GameService }) {
  const { service } = deps;
  return new OpenAPIHono<AppEnv>()
    .openapi(actionsRoute, async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      try {
        const result = await service.submitAction({
          gameId: id,
          userId: c.get("user").id,
          seatId: body.seatId,
          action: body.action,
          expectedVersion: body.expectedVersion,
          clientActionId: body.clientActionId,
        });
        return c.json(result, 200);
      } catch (error) {
        if (!(error instanceof GameServiceError)) throw error;
        const body = toErrorBody(error);
        // One literal status per branch keeps the response types exact.
        switch (error.status) {
          case 403:
            return c.json(body, 403);
          case 404:
            return c.json(body, 404);
          case 409:
            return c.json(body, 409);
          case 422:
            return c.json(body, 422);
          default:
            throw error;
        }
      }
    })
    .openapi(stateRoute, async (c) => {
      const { id } = c.req.valid("param");
      try {
        return c.json(await service.getState({ gameId: id, userId: c.get("user").id }), 200);
      } catch (error) {
        if (!(error instanceof GameServiceError)) throw error;
        const body = toErrorBody(error);
        switch (error.status) {
          case 403:
            return c.json(body, 403);
          case 404:
            return c.json(body, 404);
          case 409:
            return c.json(body, 409);
          default:
            throw error;
        }
      }
    });
}

/** Builds the state loader and the service from `deps`. Pass `onCommitted` to publish events. */
export function createGameplayRoutes(
  deps: AppDeps,
  options: Pick<GameServiceOptions, "onCommitted" | "snapshot"> & { loader?: GameStateLoader } = {},
) {
  const loader = options.loader ?? createGameStateLoader(deps.db);
  const service = createGameService({
    db: deps.db,
    loader,
    now: deps.now,
    onCommitted: options.onCommitted,
    snapshot: options.snapshot,
  });
  return gameplayRoutes({ ...deps, service });
}
