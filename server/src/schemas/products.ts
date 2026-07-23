// Zod schemas for products endpoints

import { z } from "zod";

const priceSchema = z
  .number({ error: "Price must be a number" })
  .positive("Price must be positive")
  .max(99_999_999.99, "Price must not exceed 99999999.99")
  .multipleOf(0.01, "Price must have at most 2 decimal places");

// GET /:id, DELETE /:id, GET /:id/related, variants params
export const productParamsSchema = z.object({
  id: z.string().min(1, "Product ID is required"),
});

// POST / — create product
export const createProductSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().min(1, "Description is required"),
  price: priceSchema,
  categoryId: z.string().min(1, "Category ID is required"),
  imageUrl: z.string().min(1, "Image URL is required"),
});

// PUT /:id — update product (все поля опциональны)
export const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  price: priceSchema.optional(),
  categoryId: z.string().min(1).optional(),
  imageUrl: z.string().min(1).optional(),
  isAvailable: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

export const variantParamsSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1),
});

// nullable: фронт шлёт null для пустых полей (JSON.stringify не отбрасывает null)
export const createVariantSchema = z.object({
  taste: z.string().nullable().optional(),
  size: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  price: priceSchema,
});

export const updateVariantSchema = z.object({
  taste: z.string().nullable().optional(),
  size: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  price: priceSchema.optional(),
});
