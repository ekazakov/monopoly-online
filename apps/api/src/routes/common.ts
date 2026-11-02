import type { ErrorStatus, User } from "@monopoly/shared";
import { apiErrorSchema } from "@monopoly/shared";
import type { ZodType } from "zod";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";

/** Name of the session cookie. Also the cookie name in the OpenAPI `sessionCookie` scheme. */
export const SESSION_COOKIE = "harborfront_session";

/** Hono env of every route file. The auth middleware sets `user`; read it with `c.get("user")`. */
export type AppEnv = { Variables: { user: User } };

/** Optional settings of `createApp`. Tests set them; production uses the defaults. */
export type AppOptions = {
  /** Clock for timestamps and session expiry. */
  now?: () => Date;
  /** Seed for the engine RNG of a new game. */
  seed?: () => number;
  /** Defaults to `process.env.NODE_ENV`. The session cookie is `Secure` unless it is `development` or `test`. */
  nodeEnv?: string;
};

/** What a route file receives: the database and the options with defaults applied. */
export type AppDeps = {
  db: Kysely<Database>;
  now: () => Date;
  seed: () => number;
  nodeEnv: string | undefined;
};

export function resolveDeps(db: Kysely<Database>, options: AppOptions = {}): AppDeps {
  return {
    db,
    now: options.now ?? (() => new Date()),
    seed: options.seed ?? (() => crypto.getRandomValues(new Uint32Array(1))[0]!),
    nodeEnv: options.nodeEnv ?? process.env.NODE_ENV,
  };
}

/** Add to a route that needs the session: `createRoute({ ...sessionSecurity, ... })`. */
export const sessionSecurity = { security: [{ sessionCookie: [] }] };

const errorDescriptions = {
  400: "Invalid request",
  401: "Not signed in",
  403: "Not allowed",
  404: "Not found",
  409: "Conflict with the current state",
  422: "Rejected by the game engine",
  500: "Internal server error",
} satisfies Record<ErrorStatus, string>;

// Named, so the document holds one `ApiError` component that every error response points to.
const apiErrorComponent = apiErrorSchema.openapi("ApiError");

const errorResponse = (status: ErrorStatus) => ({
  description: errorDescriptions[status],
  content: { "application/json": { schema: apiErrorComponent } },
});

/** Error entries for `responses`: `{ 200: ..., ...errorResponses(401, 404) }`. Each status uses `apiErrorSchema`. */
export function errorResponses<const S extends ErrorStatus>(
  ...statuses: S[]
): { [K in S]: ReturnType<typeof errorResponse> } {
  return Object.fromEntries(statuses.map((s) => [s, errorResponse(s)])) as {
    [K in S]: ReturnType<typeof errorResponse>;
  };
}

/** A JSON response entry: `{ 200: jsonResponse("The user", meResponseSchema) }`. */
export const jsonResponse = <S extends ZodType>(description: string, schema: S) => ({
  description,
  content: { "application/json": { schema } },
});

/**
 * A JSON request body. `required: true` matters: without it the library skips validation
 * when the request has no JSON content type.
 */
export const jsonBody = <S extends ZodType>(schema: S) => ({
  required: true as const,
  content: { "application/json": { schema } },
});
