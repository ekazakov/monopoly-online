/** The Google OAuth client values. All three are set together. */
export type GoogleConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

/** Which sign-in methods the server offers. `GET /api/auth/methods` reports them. */
export type AuthConfig = {
  /** Guest name sign-in (`POST /api/session`). For test and development only. */
  guest: boolean;
  google?: GoogleConfig;
};

const GOOGLE_VARIABLES = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
] as const;

/**
 * Read the sign-in settings from the environment. It throws a clear error when the settings break a
 * rule, so a wrong deployment does not start:
 * - Guest sign-in is on only when `GUEST_SIGN_IN_ENABLED=true`. It is never on in production.
 * - The three Google values go together. Production needs them.
 * - Every other environment needs at least one method.
 */
export function readAuthConfig(env: Record<string, string | undefined>): AuthConfig {
  const production = env.NODE_ENV === "production";

  const guestValue = env.GUEST_SIGN_IN_ENABLED ?? "";
  if (guestValue !== "" && guestValue !== "true" && guestValue !== "false") {
    throw new Error(`GUEST_SIGN_IN_ENABLED must be "true" or "false", got "${guestValue}"`);
  }
  const guest = guestValue === "true";
  if (guest && production) {
    throw new Error("GUEST_SIGN_IN_ENABLED=true is not allowed when NODE_ENV is production");
  }

  const given = GOOGLE_VARIABLES.filter((name) => (env[name] ?? "") !== "");
  if (given.length > 0 && given.length < GOOGLE_VARIABLES.length) {
    const missing = GOOGLE_VARIABLES.filter((name) => !given.includes(name));
    throw new Error(`Google sign-in needs all three values. Missing: ${missing.join(", ")}`);
  }
  const google: GoogleConfig | undefined =
    given.length === 0
      ? undefined
      : {
          clientId: env.GOOGLE_CLIENT_ID!,
          clientSecret: env.GOOGLE_CLIENT_SECRET!,
          redirectUri: env.GOOGLE_REDIRECT_URI!,
        };

  if (production && !google) {
    throw new Error(`Production needs Google sign-in: set ${GOOGLE_VARIABLES.join(", ")}`);
  }
  if (!guest && !google) {
    throw new Error(
      "No sign-in method is on. Set GUEST_SIGN_IN_ENABLED=true or the Google client values",
    );
  }
  return google ? { guest, google } : { guest };
}

/**
 * Read the debug mode flag from `DEBUG_MODE_ENABLED`. It is off when the variable is unset. The
 * start stops when the value is not `true` or `false`, or when it is `true` and `NODE_ENV` is
 * `production`.
 */
export function readDebugMode(env: Record<string, string | undefined>): boolean {
  const value = env.DEBUG_MODE_ENABLED ?? "";
  if (value !== "" && value !== "true" && value !== "false") {
    throw new Error(`DEBUG_MODE_ENABLED must be "true" or "false", got "${value}"`);
  }
  const debug = value === "true";
  if (debug && env.NODE_ENV === "production") {
    throw new Error("DEBUG_MODE_ENABLED=true is not allowed when NODE_ENV is production");
  }
  return debug;
}
