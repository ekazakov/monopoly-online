import { z } from "zod";

export const createGameSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

export type CreateGameInput = z.infer<typeof createGameSchema>;
