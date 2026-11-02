import type { User } from "@monopoly/shared";
import { ApiError, client, unwrap } from "../api.ts";

export async function getMe(): Promise<User> {
  return (await unwrap(await client.api.me.$get())).user;
}

export async function createSession(name: string): Promise<User> {
  return (await unwrap(await client.api.session.$post({ json: { name } }))).user;
}

export async function deleteSession(): Promise<void> {
  const res = await client.api.session.$delete();
  // 204 has no body, so only a failure goes through unwrap (it throws).
  if (!res.ok) await unwrap(res as Parameters<typeof unwrap>[0]);
}

export function isApiError(error: unknown, code?: ApiError["code"]): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}
