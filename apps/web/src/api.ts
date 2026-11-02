import type { AppType } from "@monopoly/api/app";
import { apiErrorSchema, type ApiIssue, type ErrorCode } from "@monopoly/shared";
import { hc } from "hono/client";

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

// One handler at a time: the router installs it (see `session/unauthorized.ts`). Returns a remover.
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): () => void {
  onUnauthorized = handler;
  return () => {
    if (onUnauthorized === handler) onUnauthorized = null;
  };
}

// Looks up `fetch` at call time, so tests can stub it. Any 401 tells the session layer that the
// session is gone, whatever call got it.
export const apiFetch: typeof fetch = async (input, init) => {
  const res = await globalThis.fetch(input, init);
  if (res.status === 401) onUnauthorized?.();
  return res;
};

export const client = hc<AppType>("/", { fetch: apiFetch });

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly issues: ApiIssue[];

  constructor(status: number, code: ErrorCode, message: string, issues: ApiIssue[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

type JsonResponse = { ok: boolean; status: number; statusText: string; json(): Promise<unknown> };
// Drop the error responses (ok: false). Routes that call c.json() with no status code have ok: boolean.
type SuccessBody<R> = R extends { ok: false }
  ? never
  : R extends { json(): Promise<infer T> }
    ? T
    : never;

// Returns the success body of an hc response. Throws ApiError for a response that is not OK.
export async function unwrap<R extends JsonResponse>(res: R): Promise<SuccessBody<R>> {
  if (res.ok) return (await res.json()) as SuccessBody<R>;

  const parsed = apiErrorSchema.safeParse(await res.json().catch(() => null));
  if (parsed.success) {
    const { code, message, issues } = parsed.data.error;
    throw new ApiError(res.status, code, message, issues);
  }
  throw new ApiError(res.status, "internal_error", res.statusText || `HTTP ${res.status}`);
}
