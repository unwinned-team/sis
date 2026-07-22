import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../prisma.js";
import log from "../logger.js";
import { httpError } from "../lib/httpError.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import {
  orderParamsSchema,
  createOrderSchema,
  isOrderTotalValid,
  updateOrderSchema,
  listOrdersQuerySchema,
} from "../schemas/orders.js";
import { generatePaymentRef, buildPaymentUrl } from "../lib/monobank.js";

// «Копеечный хвост»: сумма к оплате = totalAmount + N коп (N = 0..99), первая
// свободная среди активных (PENDING/CLAIMED) заказов — по ней матчится перевод
// без комментария. Гонку закрывает unique на paymentAmountKey (P2002 -> 409).
// ponytail: потолок 100 активных заказов на одну базовую сумму; ширить N при росте.
async function allocatePaymentAmount(
  tx: Prisma.TransactionClient,
  totalAmount: Prisma.Decimal,
): Promise<Prisma.Decimal> {
  const candidates: Prisma.Decimal[] = [];
  for (let n = 0; n < 100; n++) {
    const candidate = totalAmount.add(new Prisma.Decimal(n).div(100));
    if (isOrderTotalValid(candidate)) candidates.push(candidate);
  }
  const taken = new Set(
    (
      await tx.order.findMany({
        where: { paymentAmountKey: { in: candidates.map((c) => c.toFixed(2)) } },
        select: { paymentAmountKey: true },
      })
    ).map((o) => o.paymentAmountKey),
  );
  const free = candidates.find((c) => !taken.has(c.toFixed(2)));
  if (!free) {
    throw httpError(409, "Too many unpaid orders with this amount, try again later");
  }
  return free;
}

const router = Router();

// GET /api/v1/orders — ADMIN видит все, CUSTOMER только свои.
async function getOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user!;
    const parsed = listOrdersQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues });
    }

    const { from, to, status, take, skip } = parsed.data;

    const where: Record<string, unknown> = {};

    if (user.role !== "ADMIN") {
      where.customerId = user.id;
    }

    if (from || to) {
      const createdAt: Record<string, Date> = {};
      if (from) createdAt.gte = new Date(from);
      if (to) createdAt.lte = new Date(to);
      where.createdAt = createdAt;
    }

    if (status) {
      where.status = status;
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          items: { include: { product: true } },
        },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.order.count({ where }),
    ]);

    res.json({ orders, total });
  } catch (error) {
    next(error);
  }
}

// GET /api/v1/orders/:id — ADMIN или владелец; чужой заказ отвечает 404,
// а не 403, чтобы не раскрывать существование id.
async function getOrderById(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = orderParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues });
    }

    const user = req.user!;
    const order = await prisma.order.findUnique({
      where: { id: parsed.data.id },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        items: { include: { product: true } },
      },
    });

    if (!order || (user.role !== "ADMIN" && order.customer.id !== user.id)) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json(order);
  } catch (error) {
    next(error);
  }
}

// POST /api/v1/orders — CUSTOMER всегда оформляет на себя (customerId из
// токена, поле в теле игнорируется); ADMIN может передать customerId.
async function createOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues });
    }

    const user = req.user!;
    const { paymentMethod, items, deliveryCity, deliveryRegion, deliveryBranch } =
      parsed.data;
    const customerId =
      user.role === "ADMIN" ? (parsed.data.customerId ?? user.id) : user.id;

    const order = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      if (!customer) {
        throw httpError(404, "Customer not found");
      }

      const productIds = items.map((item) => item.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
      });
      if (products.length !== productIds.length) {
        throw httpError(404, "One or more products not found");
      }

      const unavailable = products.filter(
        (p) => !p.isAvailable || p.isArchived,
      );
      if (unavailable.length > 0) {
        const err = httpError(409, "Products unavailable");
        (err as any).details = { productIds: unavailable.map((p) => p.id) };
        throw err;
      }

      const productMap = new Map(products.map((product) => [product.id, product]));
      let totalAmount = new Prisma.Decimal(0);
      const orderItems = items.map((item) => {
        const product = productMap.get(item.productId)!;
        totalAmount = totalAmount.add(product.price.mul(item.quantity));
        return { productId: item.productId, quantity: item.quantity, price: product.price };
      });

      if (!isOrderTotalValid(totalAmount)) {
        throw httpError(400, "Order total is too large");
      }

      if (paymentMethod === "BONUS") {
        const debit = await tx.customer.updateMany({
          where: { id: customerId, bonusBalance: { gte: totalAmount } },
          data: { bonusBalance: { decrement: totalAmount } },
        });
        if (debit.count === 0) {
          throw httpError(409, "Insufficient bonus balance");
        }
      }

      // CARD: реф для комментария к переводу monobank + уникальная сумма к
      // оплате; BONUS списан в этой же транзакции — сразу PAID. CASH остаётся
      // PENDING (оплата при получении).
      const paymentAmount =
        paymentMethod === "CARD" ? await allocatePaymentAmount(tx, totalAmount) : null;

      return tx.order.create({
        data: {
          customerId,
          paymentMethod,
          totalAmount,
          paymentRef: paymentMethod === "CARD" ? generatePaymentRef() : null,
          paymentStatus: paymentMethod === "BONUS" ? "PAID" : "PENDING",
          paymentAmount,
          paymentAmountKey: paymentAmount ? paymentAmount.toFixed(2) : null,
          nextCheckAt: paymentMethod === "CARD" ? new Date() : null,
          deliveryCity,
          deliveryRegion,
          deliveryBranch,
          items: { create: orderItems },
        },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          items: { include: { product: true } },
        },
      });
    });

    log.info(
      { orderId: order.id, totalAmount: order.totalAmount, paymentMethod: order.paymentMethod, customerId },
      "Order created",
    );

    // CARD: paymentUrl — send-ссылка с предзаполненными суммой и рефом
    // (оплата картой любого банка); paymentDetails — ручной fallback
    // (реквизиты). paymentAmount/paymentRef уже в order.
    if (order.paymentMethod === "CARD") {
      const extras: Record<string, string> = {};
      if (process.env.MONOBANK_SEND_URL && order.paymentRef && order.paymentAmount) {
        extras.paymentUrl = buildPaymentUrl(order.paymentRef, order.paymentAmount);
      }
      if (process.env.MONOBANK_PAYMENT_DETAILS) {
        extras.paymentDetails = process.env.MONOBANK_PAYMENT_DETAILS;
      }
      return res.status(201).json({ ...order, ...extras });
    }
    res.status(201).json(order);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return next(httpError(404, "Customer or product not found"));
    }
    // Гонка на unique paymentAmountKey/paymentRef — повтор запроса выберет
    // другой хвост/реф.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return next(httpError(409, "Order creation conflict, please retry"));
    }
    next(error);
  }
}

// PUT /api/v1/orders/:id — только ADMIN (back-office: смена статусов и
// начисление 1% бонуса).
async function updateOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const parsedParams = orderParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return res.status(400).json({ errors: parsedParams.error.issues });
    }

    const parsedBody = updateOrderSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({ errors: parsedBody.error.issues });
    }

    const { id } = parsedParams.data;
    const { status } = parsedBody.data;

    const VALID_TRANSITIONS: Record<string, string[]> = {
      NEW: ["PROCESSING", "COMPLETED", "CANCELLED"],
      PROCESSING: ["COMPLETED", "CANCELLED"],
      COMPLETED: [],
      CANCELLED: [],
    };

    const order = await prisma.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({ where: { id } });
      if (!existing) {
        throw httpError(404, "Order not found");
      }

      // Идемпотентный повтор (ретрай клиента): тот же статус — 200 без побочных
      // эффектов, до начисления/возврата бонусов дело не доходит.
      if (status === existing.status) {
        return tx.order.findUniqueOrThrow({
          where: { id },
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            items: { include: { product: true } },
          },
        });
      }

      const allowed = VALID_TRANSITIONS[existing.status];
      if (!allowed?.includes(status)) {
        throw httpError(409, `Cannot transition from ${existing.status} to ${status}`);
      }

      const paymentData =
        status === "COMPLETED"
          ? {
              paymentStatus: "PAID" as const,
              paymentAmountKey: null,
              nextCheckAt: null,
            }
          : status === "CANCELLED"
            ? { paymentAmountKey: null, nextCheckAt: null }
            : {};

      const updated = await tx.order.updateMany({
        where: { id, status: existing.status },
        data: { status, ...paymentData },
      });

      if (updated.count === 0) {
        const current = await tx.order.findUnique({ where: { id } });
        if (!current) {
          throw httpError(404, "Order not found");
        }
        throw httpError(409, "Order was concurrently modified");
      }

      // Отмена не понижает PAID (деньги уже получены — факт нужен для
      // возврата); FAILED ставится условно, чтобы не перетереть PAID,
      // выставленный воркером параллельно.
      if (status === "CANCELLED") {
        await tx.order.updateMany({
          where: { id, paymentStatus: { in: ["PENDING", "CLAIMED"] } },
          data: { paymentStatus: "FAILED" },
        });
      }

      if (status === "COMPLETED" && existing.paymentMethod !== "BONUS") {
        const bonus = existing.totalAmount.mul("0.01").toDecimalPlaces(2);
        await tx.customer.update({
          where: { id: existing.customerId },
          data: { bonusBalance: { increment: bonus } },
        });
      }

      if (status === "CANCELLED" && existing.paymentMethod === "BONUS") {
        await tx.customer.update({
          where: { id: existing.customerId },
          data: { bonusBalance: { increment: existing.totalAmount } },
        });
      }

      log.info(
        { orderId: id, fromStatus: existing.status, toStatus: status },
        "Order status updated",
      );
      return tx.order.findUniqueOrThrow({
        where: { id },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          items: { include: { product: true } },
        },
      });
    });

    res.json(order);
  } catch (error) {
    next(error);
  }
}

// DELETE /api/v1/orders/:id — ADMIN или владелец (отмена своего NEW-заказа);
// чужой заказ отвечает 404, как и GET.
async function deleteOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = orderParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues });
    }

    const user = req.user!;
    await prisma.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({ where: { id: parsed.data.id } });
      if (!existing || (user.role !== "ADMIN" && existing.customerId !== user.id)) {
        throw httpError(404, "Order not found");
      }

      // CARD-заказ с заявленной/подтверждённой оплатой не удаляется: деньги
      // уже (возможно) пришли — след нужен для сверки и возврата. BONUS PAID
      // удалять можно — бонусы возвращаются ниже в этой же транзакции.
      if (existing.paymentMethod === "CARD" && existing.paymentStatus !== "PENDING") {
        throw httpError(409, "Order has a claimed or confirmed payment and cannot be deleted");
      }

      const deleted = await tx.order.deleteMany({
        // Повтор payment-условия закрывает гонку с webhook/воркером между
        // findUnique выше и этим delete.
        where: {
          id: parsed.data.id,
          status: "NEW",
          OR: [{ paymentMethod: { not: "CARD" } }, { paymentStatus: "PENDING" }],
        },
      });
      if (deleted.count === 0) {
        throw httpError(409, "Only unpaid orders with status NEW can be cancelled");
      }

      if (existing.paymentMethod === "BONUS") {
        await tx.customer.update({
          where: { id: existing.customerId },
          data: { bonusBalance: { increment: existing.totalAmount } },
        });
      }
    });
    log.info({ orderId: parsed.data.id, customerId: user.id }, "Order deleted");
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

router.get("/", requireAuth, getOrders);
router.get("/:id", requireAuth, getOrderById);
router.post("/", requireAuth, createOrder);
router.put("/:id", requireAuth, requireAdmin, updateOrder);
router.delete("/:id", requireAuth, deleteOrder);

export default router;
