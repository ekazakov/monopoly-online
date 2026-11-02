import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import {
  createSessionResponseSchema,
  createSessionSchema,
  meResponseSchema,
} from "@monopoly/shared";
import {
  clearSessionCookie,
  createGuestSession,
  deleteSession,
  readSessionToken,
  requireSession,
  resolveSession,
  setSessionCookie,
} from "../auth/index.ts";
import { errorBody } from "../errors.ts";
import {
  errorResponses,
  jsonBody,
  jsonResponse,
  sessionSecurity,
  type AppDeps,
  type AppEnv,
} from "./common.ts";

const createSessionRoute = createRoute({
  method: "post",
  path: "/session",
  tags: ["session"],
  summary: "Sign in as a guest with a display name",
  request: { body: jsonBody(createSessionSchema) },
  responses: {
    201: jsonResponse("The new user. The session cookie is set", createSessionResponseSchema),
    ...errorResponses(400, 403, 409),
  },
});

const meRoute = createRoute({
  method: "get",
  path: "/me",
  tags: ["session"],
  summary: "Get the signed-in user",
  ...sessionSecurity,
  responses: {
    200: jsonResponse("The signed-in user", meResponseSchema),
    ...errorResponses(401),
  },
});

const deleteSessionRoute = createRoute({
  method: "delete",
  path: "/session",
  tags: ["session"],
  summary: "Sign out",
  ...sessionSecurity,
  responses: {
    204: { description: "Signed out. The session cookie is cleared" },
    ...errorResponses(401, 403),
  },
});

export function sessionRoutes(deps: AppDeps) {
  const auth = requireSession(deps);
  const routes = new OpenAPIHono<AppEnv>();
  // `.use` and `.on` return a plain Hono type, so they stay out of the typed chain below.
  routes.use("/me", auth);
  // `POST /session` stays public, so only the DELETE method needs the session.
  routes.on("DELETE", "/session", auth);

  return routes
    .openapi(createSessionRoute, async (c) => {
      const token = readSessionToken(c);
      // An expired or unknown cookie does not block sign-in; the new cookie replaces it.
      if (token && (await resolveSession(deps, token))) {
        return c.json(errorBody("already_signed_in", "Already signed in"), 409);
      }
      const created = await createGuestSession(deps, c.req.valid("json").name);
      if (!created) return c.json(errorBody("name_taken", "This name is taken"), 409);
      setSessionCookie(c, created.token, deps.nodeEnv);
      return c.json({ user: created.user }, 201);
    })
    .openapi(meRoute, (c) => c.json({ user: c.get("user") }, 200))
    .openapi(deleteSessionRoute, async (c) => {
      // `auth` ran first, so the cookie is present and valid.
      await deleteSession(deps, readSessionToken(c)!);
      clearSessionCookie(c, deps.nodeEnv);
      return c.body(null, 204);
    });
}
