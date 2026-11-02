import { z } from "zod";

export const idSchema = z.uuid();
export const timestampSchema = z.iso.datetime();
