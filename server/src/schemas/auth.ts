import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email("Invalid email"));

export const registerSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  email: emailSchema,
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required").max(128),
});

export const mobileRefreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});
