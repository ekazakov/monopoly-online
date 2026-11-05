// Invite routes of the invitee: the inbox, accept and decline. The host invites through
// `POST /api/games/:id/invites` in `games.ts`. The rules live in `rooms/service.ts`.
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { gameResponseSchema, inviteParamsSchema, invitesResponseSchema } from "@monopoly/shared";
import type { Context } from "hono";
import { requireSession } from "../auth/index.ts";
import { errorBody, validationHook } from "../errors.ts";
import type { RoomService } from "../rooms/service.ts";
import { fail } from "./games.ts";
import {
  errorResponses,
  jsonResponse,
  sessionSecurity,
  type AppDeps,
  type AppEnv,
} from "./common.ts";

const myInvitesRoute = createRoute({
  ...sessionSecurity,
  method: "get",
  path: "/me/invites",
  tags: ["invites"],
  summary: "List my invites",
  description: "The pending invites of the user, newest first.",
  responses: {
    200: jsonResponse("The pending invites", invitesResponseSchema),
    ...errorResponses(401),
  },
});

const acceptInviteRoute = createRoute({
  ...sessionSecurity,
  method: "post",
  path: "/invites/{id}/accept",
  tags: ["invites"],
  summary: "Accept an invite",
  description:
    "Only the invitee. A normal join with the same errors, and the invite becomes `accepted` in the same transaction.",
  request: { params: inviteParamsSchema },
  responses: {
    200: jsonResponse("The game with the new seat", gameResponseSchema),
    ...errorResponses(401, 404, 409),
  },
});

const declineInviteRoute = createRoute({
  ...sessionSecurity,
  method: "post",
  path: "/invites/{id}/decline",
  tags: ["invites"],
  summary: "Decline an invite",
  description: "Only the invitee. The host can invite the same user again.",
  request: { params: inviteParamsSchema },
  responses: {
    204: { description: "The invite is declined" },
    ...errorResponses(401, 404, 409),
  },
});

// A malformed path id cannot name an invite, so it is `not_found` and not a validation error.
const inviteHook = (
  result: { success: true } | { success: false; error: unknown; target?: string },
  c: Context,
) => {
  if (!result.success && result.target === "param") {
    return c.json(errorBody("not_found", "Invite not found"), 404);
  }
  return validationHook(result as Parameters<typeof validationHook>[0], c);
};

export function inviteRoutes(deps: AppDeps & { rooms: RoomService }) {
  const { rooms } = deps;
  const routes = new OpenAPIHono<AppEnv>({ defaultHook: inviteHook });
  routes.use("/invites/*", requireSession(deps));
  routes.use("/me/invites", requireSession(deps));

  return routes
    .openapi(myInvitesRoute, async (c) =>
      c.json({ invites: await rooms.listInvites(c.get("user")) }, 200),
    )
    .openapi(acceptInviteRoute, async (c) => {
      try {
        return c.json(
          { game: await rooms.acceptInvite(c.req.valid("param").id, c.get("user")) },
          200,
        );
      } catch (error) {
        return fail<404 | 409>(c, error);
      }
    })
    .openapi(declineInviteRoute, async (c) => {
      try {
        await rooms.declineInvite(c.req.valid("param").id, c.get("user"));
      } catch (error) {
        // A route with a 204 and no body types its handler as a plain `Response`.
        return fail<404 | 409>(c, error) as unknown as Response;
      }
      return c.body(null, 204);
    });
}
