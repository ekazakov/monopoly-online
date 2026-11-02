// The result of a finished game, built from the final state and the stored events (`game/result.ts`).
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { GameEvent } from "@monopoly/game-engine";
import { errorBody } from "../errors.ts";
import { gameParamsSchema, gameResultResponseSchema } from "@monopoly/shared";
import type { GameStateLoader } from "../game/loader.ts";
import { buildGameResult } from "../game/result.ts";
import {
  errorResponses,
  jsonResponse,
  sessionSecurity,
  type AppDeps,
  type AppEnv,
} from "./common.ts";

const resultRoute = createRoute({
  ...sessionSecurity,
  method: "get",
  path: "/games/{id}/result",
  tags: ["games"],
  summary: "Read the result of a finished game",
  description:
    "For `finished` games. `standings` are in rank order: rank 1 is the winner, the others rank by elimination order (the last one out is 2). A round is `1 + floor(TurnEnded events so far / seats at game start)`; `rounds` is the round at the end and `outRound` the round in which a player went out. Net worth is cash, plus the price of each owned property (half when mortgaged), plus the build cost of each house and hotel. A player who is out has cash, properties and net worth 0. Answers 409 `game_not_finished` while the game is `waiting` or `active`, and for a finished game that has no winner.",
  request: { params: gameParamsSchema },
  responses: {
    200: jsonResponse("The result", gameResultResponseSchema),
    ...errorResponses(400, 401, 403, 404, 409, 500),
  },
});

export function resultRoutes(deps: AppDeps & { loader: GameStateLoader }) {
  const { db, loader } = deps;
  return new OpenAPIHono<AppEnv>().openapi(resultRoute, async (c) => {
    const { id } = c.req.valid("param");
    const game = await db
      .selectFrom("games")
      .select("status")
      .where("id", "=", id)
      .executeTakeFirst();
    if (!game) return c.json(errorBody("not_found", "Game not found"), 404);

    const seats = await db
      .selectFrom("seats")
      .select(["id", "controller_user_id", "user_id"])
      .where("game_id", "=", id)
      .execute();
    const userId = c.get("user").id;
    if (!seats.some((s) => s.user_id === userId || s.controller_user_id === userId)) {
      return c.json(errorBody("not_a_member", "You are not seated in this game"), 403);
    }
    if (game.status !== "finished") {
      return c.json(errorBody("game_not_finished", "The game is not finished"), 409);
    }

    const state = await loader.load(id);
    const rows = await db
      .selectFrom("game_events")
      .select("events")
      .where("game_id", "=", id)
      .orderBy("version", "asc")
      .execute();
    const events = rows.flatMap((row) => JSON.parse(row.events) as GameEvent[]);
    const result =
      state &&
      buildGameResult({
        gameId: id,
        state,
        events,
        seats: seats.map((s) => ({ id: s.id, controllerUserId: s.controller_user_id })),
      });
    if (!result) return c.json(errorBody("game_not_finished", "The game has no result"), 409);
    return c.json({ result }, 200);
  });
}
