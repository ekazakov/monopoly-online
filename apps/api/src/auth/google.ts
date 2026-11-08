import * as arctic from "arctic";
import type { GoogleConfig } from "./config.ts";

/**
 * The part of Google that the routes need. The app takes it as an option, so tests give a fake and
 * never call Google.
 */
export type GoogleProvider = {
  /** The Google consent address for this `state` and PKCE code verifier. */
  authorizationUrl(state: string, codeVerifier: string): URL;
  /** Trade the callback `code` for the Google subject. It throws when Google refuses the code. */
  exchange(code: string, codeVerifier: string): Promise<{ subject: string }>;
};

/** The real provider. It asks only for `openid`: the subject is the one value we keep. */
export function createArcticGoogle(config: GoogleConfig): GoogleProvider {
  const client = new arctic.Google(config.clientId, config.clientSecret, config.redirectUri);
  return {
    authorizationUrl: (state, codeVerifier) =>
      client.createAuthorizationURL(state, codeVerifier, ["openid"]),
    async exchange(code, codeVerifier) {
      const tokens = await client.validateAuthorizationCode(code, codeVerifier);
      // The ID token comes straight from Google's token endpoint over TLS, so reading its claims
      // without a signature check is allowed by OpenID Connect.
      const claims = arctic.decodeIdToken(tokens.idToken());
      const subject = (claims as { sub?: unknown }).sub;
      if (typeof subject !== "string" || subject === "") {
        throw new Error("The Google ID token has no subject");
      }
      return { subject };
    },
  };
}
