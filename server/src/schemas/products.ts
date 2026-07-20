// Zod schemas for products endpoints

import { z } from "zod";

const priceSchema = z
  .number({ error: "Price must be a number" })
  .positive("Price must be positive")
  .max(99_999_999.99, "Price must not exceed 99999999.99")
  .multipleOf(0.01, "Price must have at most 2 decimal places");

// POST /images/upload отдаёт локальный путь /uploads/<uuid>.ext, а не полный URL,
// поэтому одного z.url() мало — иначе загруженную картинку невозможно прикрепить
// к товару. У категорий по той же причине уже стоит обычный z.string().
const imageUrlSchema = z.union(
  [
    z.url(),
    z.string().regex(/^\/[\w\-./]+$/, "Image URL must be a valid URL or an /uploads path"),
  ],
  "Image URL must be a valid URL or an /uploads path",
);

// GET /:id, DELETE /:id, GET /:id/related
export const productParamsSchema = z.object({
  id: z.string().min(1, "Product ID is required"),
});

// GET / — публичный список; includeArchived учитывается только для ADMIN.
export const listProductsQuerySchema = z.object({
  categoryId: z.string().min(1).optional(),
  includeArchived: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

// POST / — create product
export const createProductSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    description: z.string().min(1, "Description is required"),
    price: priceSchema,
    categoryId: z.string().min(1, "Category ID is required"),
    imageUrl: imageUrlSchema,
    isAvailable: z.boolean().optional(),
  })
  .strict();

// PUT /:id — update product (все поля опциональны).
// .strict() обязателен: без него неизвестный ключ молча отбрасывается и запрос
// отвечает 200, хотя ничего не изменилось — UI покажет ложный успех.
export const updateProductSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    price: priceSchema.optional(),
    categoryId: z.string().min(1).optional(),
    imageUrl: imageUrlSchema.optional(),
    isAvailable: z.boolean().optional(),
    // Разархивирование: без этого DELETE был бы операцией без обратного хода.
    isArchived: z.boolean().optional(),
  })
  .strict();

// --- Варианты (вкусы/объёмы) ---

export const variantParamsSchema = z.object({
  id: z.string().min(1, "Product ID is required"),
  variantId: z.string().min(1, "Variant ID is required"),
});

const variantFields = {
  taste: z.string().min(1).nullable().optional(),
  size: z.string().min(1).nullable().optional(),
};

export const createVariantSchema = z
  .object({ ...variantFields, price: priceSchema })
  .strict()
  .refine(
    (data) => data.taste != null || data.size != null,
    "At least one of taste or size is required",
  );

export const updateVariantSchema = z
  .object({ ...variantFields, price: priceSchema.optional() })
  .strict()
  .refine(
    (data) => Object.values(data).some((value) => value !== undefined),
    "At least one field must be provided",
  );
