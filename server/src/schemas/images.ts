import { z } from "zod";

export const imageUrlSchema = z.object({
  url: z.string().startsWith("/uploads/"),
});

export const replaceImageSchema = z.object({
  oldUrl: z.string().startsWith("/uploads/"),
});
