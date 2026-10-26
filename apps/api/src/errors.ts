import type { ApiErrorBody, ApiIssue, ErrorCode } from "@monopoly/shared";
import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { core } from "zod";

export function errorBody(code: ErrorCode, message: string, issues?: ApiIssue[]): ApiErrorBody {
  return { error: issues ? { code, message, issues } : { code, message } };
}

function toIssues(error: core.$ZodError): ApiIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.filter((key): key is string | number => typeof key !== "symbol"),
    message: issue.message,
  }));
}

// Hook for zValidator: send validation errors in the shared error format.
export function validationHook(
  result: { success: true } | { success: false; error: core.$ZodError },
  c: Context,
) {
  if (!result.success) {
    return c.json(errorBody("validation_error", "Invalid request", toIssues(result.error)), 400);
  }
}

export const notFoundHandler: NotFoundHandler = (c) =>
  c.json(errorBody("not_found", `Route ${c.req.method} ${c.req.path} not found`), 404);

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) {
    return c.json(errorBody("bad_request", err.message || "Bad request"), err.status);
  }
  console.error(err);
  return c.json(errorBody("internal_error", "Internal server error"), 500);
};
