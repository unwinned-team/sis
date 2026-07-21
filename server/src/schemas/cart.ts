import { z } from "zod";

export const MAX_CART_ITEM_QUANTITY = 999;
export const MAX_CART_LINES = 100;

export const cartItemParamsSchema = z.object({
  id: z.string().min(1, "Cart item ID is required"),
});

const quantitySchema = z
  .number()
  .int()
  .positive("Quantity must be positive")
  .max(MAX_CART_ITEM_QUANTITY, "Quantity is too large");

export const addCartItemSchema = z
  .object({
    productId: z.string().min(1, "Product ID is required"),
    variantId: z.string().min(1, "Variant ID is required").optional(),
    quantity: quantitySchema.optional().default(1),
  })
  .strict();

export const updateCartItemSchema = z
  .object({
    quantity: quantitySchema,
  })
  .strict();
