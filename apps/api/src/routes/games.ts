// Game room routes: create, read, join, leave, hot-seat seats and start. The rules live in
// `rooms/service.ts`; the handlers map its `RoomError` to the shared error body.
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import {
  changeTokenSchema,
  createGameSchema,
  createInviteSchema,
  createSeatSchema,
  gameParamsSchema,
  gameResponseSchema,
  lobbyGamesResponseSchema,
  openGamesQuerySchema,
  seatParamsSchema,
  startGameResponseSchema,
} from "@monopoly/shared";
import type { ApiErrorBody } from "@monopoly/shared";
import type { Context, TypedResponse } from "hono";
import { requireSession } from "../auth/index.ts";
import { errorBody, validationHook } from "../errors.ts";
import { RoomError } from "../rooms/service.ts";
import type { RoomService } from "../rooms/service.ts";
import {
  errorResponses,
  jsonBody,
  jsonResponse,
  sessionSecurity,
  type AppDeps,
  type AppEnv,
} from "./common.ts";

const createGameRoute = createRoute({
  ...sessionSecurity,
  method: "post",
  path: "/games",
  tags: ["games"],
  summary: "Create a game room",
  description: "The caller owns the game and gets the first seat, named after their display name.",
  request: { body: jsonBody(createGameSchema) },
  responses: {
    201: jsonResponse("The new game, status `waiting`", gameResponseSchema),
    ...errorResponses(400, 401),
  },
});

const listOpenGamesRoute = createRoute({
  ...sessionSecurity,
  method: "get",
  path: "/games",
  tags: ["games"],
  summary: "List the open games",
  description:
    "The `waiting` games, newest first, at most 50. Full games stay in the list: the client shows them as full.",
  request: { query: openGamesQuerySchema },
  responses: {
    200: jsonResponse("The open games", lobbyGamesResponseSchema),
    ...errorResponses(400, 401),
  },
});

const listMyGamesRoute = createRoute({
  ...sessionSecurity,
  method: "get",
  path: "/me/games",
  tags: ["games"],
  summary: "List my games",
  description:
    "The `waiting` and `active` games where the user has a seat or controls a hot-seat seat, newest first. Finished games are not listed.",
  responses: {
    200: jsonResponse("My games", lobbyGamesResponseSchema),
    ...errorResponses(401),
  },
});

const getGameRoute = createRoute({
  ...sessionSecurity,
  method: "get",
  path: "/games/{id}",
  tags: ["games"],
  summary: "Read a game room",
  description: "Any signed-in user can read it. The game id is the invite.",
  request: { params: gameParamsSchema },
  responses: {
    200: jsonResponse("The game with its seats in order", gameResponseSchema),
    ...errorResponses(401, 404),
  },
});

const joinRoute = createRoute({
  ...sessionSecurity,
  method: "post",
  path: "/games/{id}/join",
  tags: ["games"],
  summary: "Join a waiting game",
  description:
    "Adds a seat named after the user. `seat_name_taken` means a hot-seat seat has this name: its controller removes it and adds it again with another name.",
  request: { params: gameParamsSchema },
  responses: {
    200: jsonResponse("The game with the new seat", gameResponseSchema),
    ...errorResponses(401, 404, 409),
  },
});

const leaveRoute = createRoute({
  ...sessionSecurity,
  method: "post",
  path: "/games/{id}/leave",
  tags: ["games"],
  summary: "Leave a waiting game",
  description:
    "Removes every seat the caller controls, hot-seat seats included. The owner cannot leave.",
  request: { params: gameParamsSchema },
  responses: {
    200: jsonResponse("The game without the seats of the caller", gameResponseSchema),
    ...errorResponses(401, 403, 404, 409),
  },
});

const addSeatRoute = createRoute({
  ...sessionSecurity,
  method: "post",
  path: "/games/{id}/seats",
  tags: ["games"],
  summary: "Add a hot-seat seat",
  description: "The seat is controlled by the caller, who must have a seat in the game.",
  request: { params: gameParamsSchema, body: jsonBody(createSeatSchema) },
  responses: {
    201: jsonResponse("The game with the new hot-seat seat", gameResponseSchema),
    ...errorResponses(400, 401, 403, 404, 409),
  },
});

const removeSeatRoute = createRoute({
  ...sessionSecurity,
  method: "delete",
  path: "/games/{id}/seats/{seatId}",
  tags: ["games"],
  summary: "Remove a hot-seat seat",
  description: "User seats are removed through `leave`.",
  request: { params: seatParamsSchema },
  responses: {
    200: jsonResponse("The game without the seat", gameResponseSchema),
    ...errorResponses(401, 403, 404, 409),
  },
});

const changeTokenRoute = createRoute({
  ...sessionSecurity,
  method: "put",
  path: "/games/{id}/seats/{seatId}/token",
  tags: ["games"],
  summary: "Change the token of a seat",
  description:
    "Only the controller of the seat, only while the game is `waiting`. `token_taken` means another seat has the token.",
  request: { params: seatParamsSchema, body: jsonBody(changeTokenSchema) },
  responses: {
    200: jsonResponse("The game with the new token", gameResponseSchema),
    ...errorResponses(400, 401, 403, 404, 409),
  },
});

const cancelGameRoute = createRoute({
  ...sessionSecurity,
  method: "delete",
  path: "/games/{id}",
  tags: ["games"],
  summary: "Cancel a waiting game",
  description:
    "Owner only, only while the game is `waiting`. Deletes the game; seats and invites go by cascade. The clients learn it from `room.cancelled`.",
  request: { params: gameParamsSchema },
  responses: {
    204: { description: "The game is deleted" },
    ...errorResponses(401, 403, 404, 409),
  },
});

const inviteRoute = createRoute({
  ...sessionSecurity,
  method: "post",
  path: "/games/{id}/invites",
  tags: ["games"],
  summary: "Invite a user by name",
  description:
    "Owner only, while the game is `waiting`. The name must match a user exactly, ignoring case. An invite does not hold a seat. A declined or expired invite goes back to `pending`.",
  request: { params: gameParamsSchema, body: jsonBody(createInviteSchema) },
  responses: {
    201: jsonResponse("The game with the new invite in `invites`", gameResponseSchema),
    ...errorResponses(400, 401, 403, 404, 409),
  },
});

const startRoute = createRoute({
  ...sessionSecurity,
  method: "post",
  path: "/games/{id}/start",
  tags: ["games"],
  summary: "Start the game",
  description:
    "Owner only, with at least two seats. Writes the version 0 snapshot and sets the status to `active`.",
  request: { params: gameParamsSchema },
  responses: {
    200: jsonResponse("The active game and its redacted start state", startGameResponseSchema),
    ...errorResponses(401, 403, 404, 409),
  },
});

// A malformed path id cannot name a game, so it is `not_found` and not a validation error.
const roomHook = (
  result: { success: true } | { success: false; error: unknown; target?: string },
  c: Context,
) => {
  if (!result.success && result.target === "param") {
    return c.json(errorBody("not_found", "Game not found"), 404);
  }
  return validationHook(result as Parameters<typeof validationHook>[0], c);
};

// One literal status set per route keeps the response types exact. The caller names the
// statuses the route declares; the service decides which one happens.
export function fail<S extends 403 | 404 | 409>(c: Context, error: unknown) {
  if (!(error instanceof RoomError)) throw error;
  return c.json(
    errorBody(error.code, error.message),
    error.status as S,
  ) as unknown as TypedResponse<ApiErrorBody, S, "json">;
}

export function gameRoutes(deps: AppDeps & { rooms: RoomService }) {
  const { rooms } = deps;
  const routes = new OpenAPIHono<AppEnv>({ defaultHook: roomHook });
  // `.use` returns a plain Hono type, so it stays out of the typed chain below.
  routes.use("/games/*", requireSession(deps));
  routes.use("/games", requireSession(deps));
  routes.use("/me/games", requireSession(deps));

  return routes
    .openapi(listOpenGamesRoute, async (c) => c.json({ games: await rooms.listOpen() }, 200))
    .openapi(listMyGamesRoute, async (c) =>
      c.json({ games: await rooms.listMine(c.get("user")) }, 200),
    )
    .openapi(createGameRoute, async (c) => {
      const game = await rooms.create(c.get("user"), c.req.valid("json").name);
      return c.json({ game }, 201);
    })
    .openapi(getGameRoute, async (c) => {
      try {
        return c.json({ game: await rooms.get(c.req.valid("param").id) }, 200);
      } catch (error) {
        return fail<404>(c, error);
      }
    })
    .openapi(joinRoute, async (c) => {
      try {
        return c.json({ game: await rooms.join(c.req.valid("param").id, c.get("user")) }, 200);
      } catch (error) {
        return fail<404 | 409>(c, error);
      }
    })
    .openapi(leaveRoute, async (c) => {
      try {
        return c.json({ game: await rooms.leave(c.req.valid("param").id, c.get("user")) }, 200);
      } catch (error) {
        return fail<403 | 404 | 409>(c, error);
      }
    })
    .openapi(addSeatRoute, async (c) => {
      try {
        const game = await rooms.addSeat(
          c.req.valid("param").id,
          c.get("user"),
          c.req.valid("json").name,
        );
        return c.json({ game }, 201);
      } catch (error) {
        return fail<403 | 404 | 409>(c, error);
      }
    })
    .openapi(removeSeatRoute, async (c) => {
      const { id, seatId } = c.req.valid("param");
      try {
        return c.json({ game: await rooms.removeSeat(id, c.get("user"), seatId) }, 200);
      } catch (error) {
        return fail<403 | 404 | 409>(c, error);
      }
    })
    .openapi(changeTokenRoute, async (c) => {
      const { id, seatId } = c.req.valid("param");
      try {
        const { token } = c.req.valid("json");
        return c.json({ game: await rooms.changeToken(id, c.get("user"), seatId, token) }, 200);
      } catch (error) {
        return fail<403 | 404 | 409>(c, error);
      }
    })
    .openapi(cancelGameRoute, async (c) => {
      try {
        await rooms.cancel(c.req.valid("param").id, c.get("user"));
      } catch (error) {
        // A route with a 204 and no body types its handler as a plain `Response`.
        return fail<403 | 404 | 409>(c, error) as unknown as Response;
      }
      return c.body(null, 204);
    })
    .openapi(inviteRoute, async (c) => {
      try {
        const game = await rooms.invite(
          c.req.valid("param").id,
          c.get("user"),
          c.req.valid("json").name,
        );
        return c.json({ game }, 201);
      } catch (error) {
        return fail<403 | 404 | 409>(c, error);
      }
    })
    .openapi(startRoute, async (c) => {
      try {
        return c.json(await rooms.start(c.req.valid("param").id, c.get("user")), 200);
      } catch (error) {
        return fail<403 | 404 | 409>(c, error);
      }
    });
}
