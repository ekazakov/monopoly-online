// Owner routes that end or pause a started game. The rules live in `game/lifecycle.ts`; the
// handlers map its `GameServiceError` to the shared error body.
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { gameParamsSchema, gameResponseSchema } from "@monopoly/shared";
import type { LifecycleService } from "../game/lifecycle.ts";
import { GameServiceError } from "../game/service.ts";
import {
  errorResponses,
  jsonResponse,
  sessionSecurity,
  type AppDeps,
  type AppEnv,
} from "./common.ts";

const finishRoute = createRoute({
  ...sessionSecurity,
  method: "post",
  path: "/games/{id}/finish",
  tags: ["games"],
  summary: "Finish the game with no winner",
  description:
    "Owner only. From `active` the game rolls back to the start of the turn. From `saved` the state does not change. The status becomes `finished` and every device gets a `snapshot`.",
  request: { params: gameParamsSchema },
  responses: {
    200: jsonResponse("The finished game", gameResponseSchema),
    ...errorResponses(400, 401, 403, 404, 409, 500),
  },
});

const saveRoute = createRoute({
  ...sessionSecurity,
  method: "post",
  path: "/games/{id}/save",
  tags: ["games"],
  summary: "Save the game and leave it for later",
  description:
    "Owner only, `active` games only. The game rolls back to the start of the turn, the status becomes `saved`, all seat claims are cleared and every device gets a `snapshot`. Restore continues it with the same dice.",
  request: { params: gameParamsSchema },
  responses: {
    200: jsonResponse("The saved game", gameResponseSchema),
    ...errorResponses(400, 401, 403, 404, 409, 500),
  },
});

const claimRoute = createRoute({
  ...sessionSecurity,
  method: "post",
  path: "/games/{id}/claim",
  tags: ["games"],
  summary: "Claim your seats in a saved game",
  description:
    "Any member who controls a seat. Sets `claimed` on the seats that the caller controls. Only while the game is `saved`. The room hears of it through `room.updated`.",
  request: { params: gameParamsSchema },
  responses: {
    200: jsonResponse("The game with the new claims", gameResponseSchema),
    ...errorResponses(400, 401, 403, 404, 409, 500),
  },
});

const restoreRoute = createRoute({
  ...sessionSecurity,
  method: "post",
  path: "/games/{id}/restore",
  tags: ["games"],
  summary: "Continue a saved game",
  description:
    "Owner only, `saved` games only. The status becomes `active` and the owner's seats are claimed. The state and the version do not change, so the next roll gives the same dice. Every device gets a `snapshot`.",
  request: { params: gameParamsSchema },
  responses: {
    200: jsonResponse("The active game", gameResponseSchema),
    ...errorResponses(400, 401, 403, 404, 409, 500),
  },
});

export function lifecycleRoutes(deps: AppDeps & { lifecycle: LifecycleService }) {
  const { lifecycle } = deps;
  return new OpenAPIHono<AppEnv>()
    .openapi(finishRoute, async (c) => {
      const { id } = c.req.valid("param");
      try {
        return c.json(await lifecycle.finish({ gameId: id, userId: c.get("user").id }), 200);
      } catch (error) {
        if (!(error instanceof GameServiceError)) throw error;
        const body = { error: { code: error.code, message: error.message } };
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
    })
    .openapi(restoreRoute, async (c) => {
      const { id } = c.req.valid("param");
      try {
        return c.json(await lifecycle.restore({ gameId: id, userId: c.get("user").id }), 200);
      } catch (error) {
        if (!(error instanceof GameServiceError)) throw error;
        const body = { error: { code: error.code, message: error.message } };
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
    })
    .openapi(claimRoute, async (c) => {
      const { id } = c.req.valid("param");
      try {
        return c.json(await lifecycle.claim({ gameId: id, userId: c.get("user").id }), 200);
      } catch (error) {
        if (!(error instanceof GameServiceError)) throw error;
        const body = { error: { code: error.code, message: error.message } };
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
    })
    .openapi(saveRoute, async (c) => {
      const { id } = c.req.valid("param");
      try {
        return c.json(await lifecycle.save({ gameId: id, userId: c.get("user").id }), 200);
      } catch (error) {
        if (!(error instanceof GameServiceError)) throw error;
        const body = { error: { code: error.code, message: error.message } };
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
