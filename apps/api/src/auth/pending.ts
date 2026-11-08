import { randomBytes } from "node:crypto";

/** A pending sign-in lives this long. It matches the Max-Age of its cookie. */
export const PENDING_TTL_MS = 10 * 60 * 1000;

/**
 * Google subjects that passed Google but have no user yet. The user is on the name step. The map is
 * in memory: a restart makes the user sign in with Google again, which is cheap. It holds the
 * subject only, so nothing is lost that Google cannot give again.
 */
export function createPendingSignIns(now: () => Date) {
  const entries = new Map<string, { subject: string; expiresAt: number }>();

  const sweep = () => {
    const time = now().getTime();
    for (const [token, entry] of entries) if (entry.expiresAt <= time) entries.delete(token);
  };

  return {
    /** Remember a subject. Returns the token for the cookie. */
    create(subject: string) {
      sweep();
      const token = randomBytes(32).toString("base64url");
      entries.set(token, { subject, expiresAt: now().getTime() + PENDING_TTL_MS });
      return token;
    },
    /** The subject of a live token, or undefined. */
    peek(token: string | undefined) {
      if (!token) return undefined;
      const entry = entries.get(token);
      if (!entry || entry.expiresAt <= now().getTime()) return undefined;
      return entry.subject;
    },
    /** Forget a token after the user is made. */
    consume(token: string) {
      entries.delete(token);
    },
  };
}

export type PendingSignIns = ReturnType<typeof createPendingSignIns>;
