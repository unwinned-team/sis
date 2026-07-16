import { z } from "zod";

const paymentMethodSchema = z.enum(["CARD", "CASH", "BONUS"]);
const orderStatusSchema = z.enum(["NEW", "PROCESSING", "COMPLETED", "CANCELLED"]);

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
        quantity: z.number().int().positive("Quantity must be positive"),
      }),
    )
    .min(1, "At least one item is required"),
});

export const updateOrderSchema = z.object({
  status: orderStatusSchema.optional(),
  paymentMethod: paymentMethodSchema.optional(),
});
