import { z } from "zod";

export const errorCodes = [
  "bad_request",
  "validation_error",
  "not_found",
  "internal_error",
] as const;

export type ErrorCode = (typeof errorCodes)[number];

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
  }),
});

export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
export type ApiIssue = NonNullable<ApiErrorBody["error"]["issues"]>[number];
