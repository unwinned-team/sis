import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email("Invalid email"));

export const customerParamsSchema = z.object({
  id: z.string().min(1, "Customer ID is required"),
});

export const createCustomerSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  email: emailSchema.optional(),
  phone: z.string().min(1, "Phone is required").optional(),
});

export const updateCustomerSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: emailSchema.optional(),
  phone: z.string().min(1).optional(),
});
