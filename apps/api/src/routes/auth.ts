import { randomBytes, timingSafeEqual } from "node:crypto";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  authMethodsSchema,
  googleNameRequestSchema,
  googleNameResponseSchema,
} from "@monopoly/shared";
import {
  clearGoogleCookie,
  createGoogleUserSession,
  createSessionForGoogleSubject,
  readGoogleCookie,
  readSessionToken,
  resolveSession,
  setGoogleCookie,
  setSessionCookie,
  type GoogleProvider,
  type PendingSignIns,
} from "../auth/index.ts";
import { errorBody } from "../errors.ts";
import { errorResponses, jsonBody, jsonResponse, type AppDeps, type AppEnv } from "./common.ts";

const STATE_COOKIE = "harborfront_google_state";
const VERIFIER_COOKIE = "harborfront_google_verifier";
const PENDING_COOKIE = "harborfront_google_pending";

/** Where the callback sends the browser. The web app owns these screens. */
export const AFTER_SIGN_IN = "/";
export const SIGN_IN_FAILED = "/sign-in?error=oauth_failed";
export const SIGN_IN_NAME_STEP = "/sign-in?step=name";

const methodsRoute = createRoute({
  method: "get",
  path: "/auth/methods",
  tags: ["auth"],
  summary: "Get the sign-in methods that are on",
  responses: { 200: jsonResponse("The methods", authMethodsSchema) },
});

const startRoute = createRoute({
  method: "get",
  path: "/auth/google/start",
  tags: ["auth"],
  summary: "Start Google sign-in",
  description:
    "Sets the `state` and PKCE cookies and redirects to Google. Answers 404 when Google is off.",
  responses: {
    302: { description: "Redirect to the Google consent screen" },
    ...errorResponses(404, 409),
  },
});

const callbackRoute = createRoute({
  method: "get",
  path: "/auth/google/callback",
  tags: ["auth"],
  summary: "Finish Google sign-in",
  description:
    "Google sends the browser here. A known Google user gets a session cookie and goes to `/`. A new " +
    "Google user gets a pending sign-in cookie and goes to `/sign-in?step=name`. A bad `state`, a " +
    "refusal or a failed exchange goes to `/sign-in?error=oauth_failed`.",
  request: {
    query: z.object({
      code: z.string().optional(),
      state: z.string().optional(),
      error: z.string().optional(),
    }),
  },
  responses: {
    302: { description: "Redirect to the web app" },
    ...errorResponses(404),
  },
});

const nameRoute = createRoute({
  method: "post",
  path: "/auth/google/name",
  tags: ["auth"],
  summary: "Choose the display name of a new Google user",
  description:
    "Needs the pending sign-in cookie from the callback. Makes the user, the identity row and the session.",
  request: { body: jsonBody(googleNameRequestSchema) },
  responses: {
    200: jsonResponse("The new user. The session cookie is set", googleNameResponseSchema),
    ...errorResponses(400, 401, 404, 409),
  },
});

const sameValue = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

const randomToken = () => randomBytes(32).toString("base64url");

type AuthRoutesOptions = {
  guest: boolean;
  /** Undefined when Google sign-in is off. */
  google: GoogleProvider | undefined;
  pending: PendingSignIns;
  /** Debug mode, reported to the web app so it shows the debug panel only when it is on. */
  debug: boolean;
};

export function authRoutes(deps: AppDeps, { guest, google, pending, debug }: AuthRoutesOptions) {
  const routes = new OpenAPIHono<AppEnv>();
  const signedIn = async (c: Parameters<typeof readSessionToken>[0]) => {
    const token = readSessionToken(c);
    return token !== undefined && (await resolveSession(deps, token)) !== null;
  };
  const googleOff = () => errorBody("not_found", "Google sign-in is off");

  return routes
    .openapi(methodsRoute, (c) => c.json({ google: google !== undefined, guest, debug }, 200))
    .openapi(startRoute, async (c) => {
      if (!google) return c.json(googleOff(), 404);
      if (await signedIn(c)) {
        return c.json(errorBody("already_signed_in", "Already signed in"), 409);
      }
      const state = randomToken();
      const verifier = randomToken();
      setGoogleCookie(c, STATE_COOKIE, state, deps.nodeEnv);
      setGoogleCookie(c, VERIFIER_COOKIE, verifier, deps.nodeEnv);
      return c.redirect(google.authorizationUrl(state, verifier).toString(), 302);
    })
    .openapi(callbackRoute, async (c) => {
      if (!google) return c.json(googleOff(), 404);
      const state = readGoogleCookie(c, STATE_COOKIE);
      const verifier = readGoogleCookie(c, VERIFIER_COOKIE);
      // The cookies serve one attempt. Clear them whatever happens next.
      clearGoogleCookie(c, STATE_COOKIE, deps.nodeEnv);
      clearGoogleCookie(c, VERIFIER_COOKIE, deps.nodeEnv);

      const query = c.req.valid("query");
      const log = c.get("log");
      if (!query.code || query.error || !state || !verifier || !query.state) {
        // `error` is the OAuth error name, for example `access_denied`. It holds no token.
        log.warn(
          { reason: query.error ? "provider_error" : "missing_values", providerError: query.error },
          "google sign-in refused",
        );
        return c.redirect(SIGN_IN_FAILED, 302);
      }
      if (!sameValue(state, query.state)) {
        log.warn({ reason: "state_mismatch" }, "google sign-in refused");
        return c.redirect(SIGN_IN_FAILED, 302);
      }

      let subject: string;
      try {
        ({ subject } = await google.exchange(query.code, verifier));
      } catch (err) {
        log.error({ err }, "google sign-in failed");
        return c.redirect(SIGN_IN_FAILED, 302);
      }

      const known = await createSessionForGoogleSubject(deps, subject);
      if (known) {
        setSessionCookie(c, known.token, deps.nodeEnv);
        log.info({ userId: known.user.id, provider: "google" }, "signed in");
        return c.redirect(AFTER_SIGN_IN, 302);
      }
      setGoogleCookie(c, PENDING_COOKIE, pending.create(subject), deps.nodeEnv);
      return c.redirect(SIGN_IN_NAME_STEP, 302);
    })
    .openapi(nameRoute, async (c) => {
      if (!google) return c.json(googleOff(), 404);
      const pendingToken = readGoogleCookie(c, PENDING_COOKIE);
      const subject = pending.peek(pendingToken);
      if (!pendingToken || subject === undefined) {
        return c.json(errorBody("unauthorized", "No sign-in is waiting for a name"), 401);
      }
      const created = await createGoogleUserSession(deps, subject, c.req.valid("json").name);
      // The pending sign-in stays, so the user can try another name.
      if (!created) return c.json(errorBody("name_taken", "This name is taken"), 409);
      pending.consume(pendingToken);
      clearGoogleCookie(c, PENDING_COOKIE, deps.nodeEnv);
      setSessionCookie(c, created.token, deps.nodeEnv);
      c.get("log").info(
        { userId: created.user.id, provider: "google", newUser: true },
        "signed in",
      );
      return c.json({ user: created.user }, 200);
    });
}
