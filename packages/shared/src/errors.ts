import { z } from "zod";

/** Codes the API itself raises. Engine rejections come from `engineErrorCodes`. */
export const apiErrorCodes = [
  "bad_request",
  "validation_error",
  "unauthorized",
  "forbidden_origin",
  "not_game_owner",
  "not_a_member",
  "not_your_seat",
  "not_found",
  "already_signed_in",
  "name_taken",
  "already_joined",
  "game_full",
  "game_not_waiting",
  "game_not_active",
  "game_not_finished",
  "not_enough_players",
  "seat_name_taken",
  "owner_cannot_leave",
  "cannot_remove_user_seat",
  "version_conflict",
  "internal_error",
] as const;

/** The engine `GameErrorCode` list. The drift test keeps it equal to the engine type. */
export const engineErrorCodes = [
  "invalid_players",
  "unknown_player",
  "player_inactive",
  "not_your_turn",
  "wrong_phase",
  "insufficient_funds",
  "no_jail_card",
  "not_owner",
  "not_a_street",
  "incomplete_group",
  "group_mortgaged",
  "uneven_build",
  "max_buildings",
  "no_buildings",
  "not_a_property",
  "already_mortgaged",
  "not_mortgaged",
  "has_buildings",
  "no_debt",
  "invalid_bid",
  "invalid_trade",
  "auction_running",
] as const;

export const errorCodes = [...apiErrorCodes, ...engineErrorCodes] as const;

export type ApiErrorCode = (typeof apiErrorCodes)[number];
export type EngineErrorCode = (typeof engineErrorCodes)[number];
export type ErrorCode = (typeof errorCodes)[number];

export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 422 | 500;

const apiErrorStatus: Record<ApiErrorCode, ErrorStatus> = {
  bad_request: 400,
  validation_error: 400,
  unauthorized: 401,
  forbidden_origin: 403,
  not_game_owner: 403,
  not_a_member: 403,
  not_your_seat: 403,
  not_found: 404,
  already_signed_in: 409,
  name_taken: 409,
  already_joined: 409,
  game_full: 409,
  game_not_waiting: 409,
  game_not_active: 409,
  game_not_finished: 409,
  not_enough_players: 409,
  seat_name_taken: 409,
  owner_cannot_leave: 409,
  cannot_remove_user_seat: 409,
  version_conflict: 409,
  internal_error: 500,
};

/** HTTP status of each error code. Every engine code is 422. */
export function errorStatus(code: ErrorCode): ErrorStatus {
  return code in apiErrorStatus ? apiErrorStatus[code as ApiErrorCode] : 422;
}

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(errorCodes),
    message: z.string(),
    issues: z
      .array(
        z.object({
          path: z.array(z.union([z.string(), z.number()])),
          message: z.string(),
        }),
      )
      .optional(),
    /** Set with `version_conflict`: the version the server holds now. */
    currentVersion: z.number().int().nonnegative().optional(),
  }),
});

export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
export type ApiIssue = NonNullable<ApiErrorBody["error"]["issues"]>[number];
