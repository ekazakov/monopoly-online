import type { ErrorCode } from "@monopoly/shared";
import type { ApiIssue } from "@monopoly/shared";
import { ApiError } from "../api.ts";

/** `ApiError` of an action POST. `currentVersion` is set with `version_conflict`. */
export class ActionApiError extends ApiError {
  readonly currentVersion: number | undefined;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    issues: ApiIssue[] = [],
    currentVersion?: number,
  ) {
    super(status, code, message, issues);
    this.currentVersion = currentVersion;
  }
}
