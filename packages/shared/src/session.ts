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

export const healthResponseSchema = z.strictObject({ status: z.literal("ok") });

export type User = z.infer<typeof userSchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
