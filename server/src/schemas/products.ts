// Zod schemas for products endpoints

import { z } from "zod";

const priceSchema = z
  .number({ error: "Price must be a number" })
  .positive("Price must be positive")
  .max(99_999_999.99, "Price must not exceed 99999999.99")
  .multipleOf(0.01, "Price must have at most 2 decimal places");

// GET /:id, DELETE /:id, GET /:id/related
export const productParamsSchema = z.object({
  id: z.string().min(1, "Product ID is required"),
});

// POST / — create product
export const createProductSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().min(1, "Description is required"),
  price: priceSchema,
  categoryId: z.string().min(1, "Category ID is required"),
  imageUrl: z.url("Image URL must be valid"),
});

// PUT /:id — update product (все поля опциональны)
export const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  price: priceSchema.optional(),
  categoryId: z.string().min(1).optional(),
  imageUrl: z.url().optional(),
});
