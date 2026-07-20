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

// GET / — фильтр по периоду + пагинация. take ограничен сверху, чтобы админка
// не могла случайно вытянуть всю таблицу заказов одним запросом.
export const listOrdersQuerySchema = z
  .object({
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    status: orderStatusSchema.optional(),
    take: z.coerce.number().int().min(1).max(100).default(50),
    skip: z.coerce.number().int().min(0).default(0),
  })
  .strict()
  .refine(
    (data) => !data.from || !data.to || new Date(data.from) <= new Date(data.to),
    { error: "from must be earlier than or equal to to", path: ["from"] },
  );

export function isOrderTotalValid(total: Prisma.Decimal) {
  return total.lessThanOrEqualTo(MAX_ORDER_TOTAL);
}
