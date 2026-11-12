import { errorCodes } from "@monopoly/shared";
import type { ErrorCode } from "@monopoly/shared";
import type { Translate } from "./translate.ts";

const known = new Set<string>(errorCodes);

/**
 * Codes whose server message names an amount (a bid step, what a partner owns). The one text of
 * the catalogue cannot say that, so the server message shows when there is one.
 */
const DETAILED = new Set<string>(["invalid_bid", "invalid_trade"]);

/**
 * The text of a failed request or a rejected game action. An API error and an engine rejection
 * both carry a `code` from `@monopoly/shared`: the web catalogue has one text for each code (the
 * key `error.<code>`, so a new code fails the type check until it has a text). Anything else
 * shows its own message, and the code itself is the last choice.
 */
export function errorMessage(error: unknown, t: Translate): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code: unknown }).code
      : undefined;
  // Status 0: the request never reached the server, and the message was made on this device.
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? (error as { status: unknown }).status
      : undefined;
  if (status === 0 && error instanceof Error && error.message) return error.message;
  if (typeof code === "string" && known.has(code)) {
    const message = (error as { message?: unknown }).message;
    if (DETAILED.has(code) && typeof message === "string" && message) return message;
    return t(`error.${code as ErrorCode}`);
  }
  if (error instanceof Error && error.message) return error.message;
  return typeof code === "string" ? code : t("error.unknown");
}
