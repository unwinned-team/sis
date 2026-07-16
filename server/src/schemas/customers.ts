import { z } from "zod";

export const customerParamsSchema = z.object({
  id: z.string().min(1, "Customer ID is required"),
});

export const createCustomerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.email("Invalid email").optional(),
  phone: z.string().min(1, "Phone is required").optional(),
});

export const updateCustomerSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.email("Invalid email").optional(),
  phone: z.string().min(1).optional(),
});
