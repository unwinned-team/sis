// Zod schemas for products endpoints

import { z } from "zod";

// GET /:id, DELETE /:id, GET /:id/related
export const productParamsSchema = z.object({
  id: z.string().min(1, "Product ID is required"),
});

// POST / — create product
export const createProductSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().min(1, "Description is required"),
  price: z.coerce.number().positive("Price must be positive"),
  categoryId: z.string().min(1, "Category ID is required"),
  imageUrl: z.url("Image URL must be valid"),
});

// PUT /:id — update product (все поля опциональны)
export const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  price: z.coerce.number().positive().optional(),
  categoryId: z.string().min(1).optional(),
  imageUrl: z.url().optional(),
});
