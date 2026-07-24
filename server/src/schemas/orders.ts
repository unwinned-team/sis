import { z } from "zod";
import { Prisma } from "@prisma/client";

const paymentMethodSchema = z.enum(["CARD", "CASH", "BONUS"]);
const orderStatusSchema = z.enum(["NEW", "PROCESSING", "COMPLETED", "CANCELLED"]);
const MAX_DATABASE_INT = 2_147_483_647;
const MAX_ORDER_TOTAL = new Prisma.Decimal("99999999.99");

export const orderParamsSchema = z.object({
  id: z.string().min(1, "Order ID is required"),
});

export const createOrderSchema = z.object({
  // CUSTOMER: игнорируется, id берётся из токена. ADMIN: заказ от имени
  // клиента (POS-сценарий); без поля — заказ на самого админа.
  customerId: z.string().min(1, "Customer ID is required").optional(),
  paymentMethod: paymentMethodSchema,
  deliveryCity: z.string().trim().min(1, "City is required").max(100),
  deliveryRegion: z.string().trim().min(1, "Region is required").max(100),
  deliveryBranch: z.string().trim().min(1, "Branch is required").max(20),
  // Опциональны ради обратной совместимости (POS/mobile); веб-чекаут требует оба.
  contactPhone: z.string().trim().min(1).max(20).optional(),
  telegramUsername: z.string().trim().min(1).max(40).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1, "Product ID is required"),
        variantId: z.string().min(1).optional(),
        quantity: z
          .number()
          .int()
          .positive("Quantity must be positive")
          .max(MAX_DATABASE_INT, "Quantity is too large"),
      }),
    )
    .min(1, "At least one item is required")
    .refine(
      (items) =>
        new Set(items.map((item) => `${item.productId}:${item.variantId ?? ""}`)).size ===
        items.length,
      "Duplicate order items are not allowed",
    ),
});

export const updateOrderSchema = z.object({ status: orderStatusSchema }).strict();

export const listOrdersQuerySchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  status: orderStatusSchema.optional(),
  take: z.coerce.number().int().min(1).max(100).optional().default(50),
  skip: z.coerce.number().int().min(0).optional().default(0),
});

export function isOrderTotalValid(total: Prisma.Decimal) {
  return total.lessThanOrEqualTo(MAX_ORDER_TOTAL);
}
