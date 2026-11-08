import type { AuthMethods, User } from "@monopoly/shared";
import { ApiError, client, unwrap } from "../api.ts";

export async function getMe(): Promise<User> {
  return (await unwrap(await client.api.me.$get())).user;
}

export async function createSession(name: string): Promise<User> {
  return (await unwrap(await client.api.session.$post({ json: { name } }))).user;
}

/** The sign-in methods the server offers. No session is needed. */
export async function getAuthMethods(): Promise<AuthMethods> {
  return unwrap(await client.api.auth.methods.$get());
}

/** The display name of a new Google user. Needs the pending sign-in cookie from the callback. */
export async function chooseGoogleName(name: string): Promise<User> {
  return (await unwrap(await client.api.auth.google.name.$post({ json: { name } }))).user;
}

/** Where the browser goes to start Google sign-in. It is a full page navigation, not a fetch. */
export const GOOGLE_START_PATH = "/api/auth/google/start";

export async function deleteSession(): Promise<void> {
  const res = await client.api.session.$delete();
  // 204 has no body, so only a failure goes through unwrap (it throws).
  if (!res.ok) await unwrap(res as Parameters<typeof unwrap>[0]);
}

export function isApiError(error: unknown, code?: ApiError["code"]): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}
