import { z } from "zod";

const paymentMethodSchema = z.enum(["CARD", "CASH", "BONUS"]);
const orderStatusSchema = z.enum(["NEW", "PROCESSING", "COMPLETED", "CANCELLED"]);
const MAX_DATABASE_INT = 2_147_483_647;

export const orderParamsSchema = z.object({
  id: z.string().min(1, "Order ID is required"),
});

export const createOrderSchema = z.object({
  customerId: z.string().min(1, "Customer ID is required"),
  paymentMethod: paymentMethodSchema,
  items: z
    .array(
      z.object({
        productId: z.string().min(1, "Product ID is required"),
        quantity: z
          .number()
          .int()
          .positive("Quantity must be positive")
          .max(MAX_DATABASE_INT, "Quantity is too large"),
      }),
    )
    .min(1, "At least one item is required")
    .refine(
      (items) => new Set(items.map((item) => item.productId)).size === items.length,
      "Duplicate products are not allowed",
    ),
});

export const updateOrderSchema = z.object({ status: orderStatusSchema }).strict();
