import { z } from "zod";
import { idSchema, timestampSchema } from "./common.ts";

export const displayNameSchema = z.string().trim().min(2).max(16);

export const userSchema = z.strictObject({
  id: idSchema,
  name: displayNameSchema,
  createdAt: timestampSchema,
});

export const createSessionSchema = z.strictObject({ name: displayNameSchema });

export const userResponseSchema = z.strictObject({ user: userSchema });
/** `POST /api/session` answers 201 with the new user. */
export const createSessionResponseSchema = userResponseSchema;
/** `GET /api/me` answers 200 with the signed-in user. */
export const meResponseSchema = userResponseSchema;

/** `GET /api/auth/methods`: which sign-in buttons the server offers. No session is needed. */
export const authMethodsSchema = z.strictObject({ google: z.boolean(), guest: z.boolean() });

/** `POST /api/auth/google/name`: the display name of a new Google user. Answers 200 with the user. */
export const googleNameRequestSchema = z.strictObject({ name: displayNameSchema });
export const googleNameResponseSchema = userResponseSchema;

export const healthResponseSchema = z.strictObject({ status: z.literal("ok") });

export type User = z.infer<typeof userSchema>;
export type AuthMethods = z.infer<typeof authMethodsSchema>;
export type GoogleNameInput = z.infer<typeof googleNameRequestSchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
