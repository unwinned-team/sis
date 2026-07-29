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
    const {
      paymentMethod,
      items,
      deliveryCity,
      deliveryRegion,
      deliveryBranch,
      recipientName,
      contactPhone,
      telegramUsername,
    } = parsed.data;
    const customerId =
      user.role === "ADMIN" ? (parsed.data.customerId ?? user.id) : user.id;
    const ipAddress = req.ip ?? req.socket.remoteAddress;
    if (!ipAddress) {
      throw httpError(500, "Client IP unavailable");
    }

    const order = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      if (!customer) {
        throw httpError(404, "Customer not found");
      }

      // Один товар может встречаться в нескольких позициях (разные варианты).
      const productIds = [...new Set(items.map((item) => item.productId))];
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        include: { category: { select: { isArchived: true } } },
      });
      if (products.length !== productIds.length) {
        throw httpError(404, "One or more products not found");
      }

      const unavailable = products.filter(
        (p) => !p.isAvailable || p.isArchived || p.category.isArchived,
      );
      if (unavailable.length > 0) {
        const err = httpError(409, "Products unavailable");
        (err as any).details = { productIds: unavailable.map((p) => p.id) };
        throw err;
      }

      const variantIds = items
        .map((item) => item.variantId)
        .filter((value): value is string => value !== undefined);
      const variants = variantIds.length
        ? await tx.productVariant.findMany({ where: { id: { in: variantIds } } })
        : [];
      const variantMap = new Map(variants.map((variant) => [variant.id, variant]));
      for (const item of items) {
        if (!item.variantId) continue;
        const variant = variantMap.get(item.variantId);
        if (!variant || variant.productId !== item.productId) {
          throw httpError(404, "One or more product variants not found");
        }
      }

      const productMap = new Map(products.map((product) => [product.id, product]));
      let totalAmount = new Prisma.Decimal(0);
      const orderItems = items.map((item) => {
        const product = productMap.get(item.productId)!;
        const variant = item.variantId ? variantMap.get(item.variantId)! : null;
        // Цена и смак/объём — снимок варианта (или товара) на момент заказа.
        const price = variant?.price ?? product.price;
        totalAmount = totalAmount.add(price.mul(item.quantity));
        return {
          productId: item.productId,
          variantId: item.variantId ?? null,
          taste: variant?.taste ?? null,
          size: variant?.size ?? null,
          quantity: item.quantity,
          price,
        };
      });

      if (!isOrderTotalValid(totalAmount)) {
        throw httpError(400, "Order total is too large");
      }

      // BONUS = «плачу лише бонусами», решта методів можуть списати частину.
      // Обрізаємо до суми замовлення: решта бонусів лишається на балансі.
      const bonusRequested =
        paymentMethod === "BONUS"
          ? totalAmount
          : Prisma.Decimal.min(
              new Prisma.Decimal(parsed.data.bonusToSpend ?? 0),
              totalAmount,
            );

      let bonusApplied = new Prisma.Decimal(0);
      if (bonusRequested.greaterThan(0)) {
        // Списание одним updateMany с гардом по балансу: параллельный заказ не
        // уведёт баланс в минус, проверка и запись атомарны.
        const debit = await tx.customer.updateMany({
          where: { id: customerId, bonusBalance: { gte: bonusRequested } },
          data: { bonusBalance: { decrement: bonusRequested } },
        });
        if (debit.count === 0) {
          throw httpError(409, "Insufficient bonus balance");
        }
        bonusApplied = bonusRequested;
      }

      // До сплати грошима. Бонуси покрили все — платити нічого, статус PAID.
      const payable = totalAmount.sub(bonusApplied);
      const isCardPayment = paymentMethod === "CARD" && payable.greaterThan(0);

      // CARD: реф для комментария к переводу monobank + уникальная сумма к
      // оплате; полностью оплаченный бонусами заказ — сразу PAID. CASH остаётся
      // PENDING (оплата при получении).
      const paymentAmount = isCardPayment ? await allocatePaymentAmount(tx, payable) : null;

      return tx.order.create({
        data: {
          customerId,
          paymentMethod,
          totalAmount,
          bonusApplied,
          paymentRef: isCardPayment ? generatePaymentRef() : null,
          paymentStatus: payable.isZero() ? "PAID" : "PENDING",
          paymentAmount,
          paymentAmountKey: paymentAmount ? paymentAmount.toFixed(2) : null,
          nextCheckAt: isCardPayment ? new Date() : null,
          deliveryCity,
          deliveryRegion,
          deliveryBranch,
          recipientName: recipientName ?? null,
          contactPhone: contactPhone ?? null,
          telegramUsername: telegramUsername ?? null,
          ageVerification: { create: { ipAddress } },
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
      // COMPLETED = відправлено; бонуси нараховуються лише після підтвердження
      // отримання (RECEIVED) — клієнт може відмовитись забирати посилку (REJECTED).
      COMPLETED: ["RECEIVED", "REJECTED"],
      RECEIVED: [],
      REJECTED: [],
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
          : status === "CANCELLED" || status === "REJECTED"
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

      // Отмена/отказ не понижает PAID (деньги уже получены — факт нужен для
      // возврата); FAILED ставится условно, чтобы не перетереть PAID,
      // выставленный воркером параллельно.
      if (status === "CANCELLED" || status === "REJECTED") {
        await tx.order.updateMany({
          where: { id, paymentStatus: { in: ["PENDING", "CLAIMED"] } },
          data: { paymentStatus: "FAILED" },
        });
      }

      // Бонус нараховується лише коли клієнт підтвердив отримання (RECEIVED),
      // не в момент відправки (COMPLETED) — інакше відмова від посилки
      // (REJECTED) вже нарахувала б бонус. 1% рахується з грошової частини:
      // за оплачене бонусами нові бонуси не капають.
      const paidWithMoney = existing.totalAmount.sub(existing.bonusApplied);
      if (status === "RECEIVED" && paidWithMoney.greaterThan(0)) {
        const bonus = paidWithMoney.mul("0.01").toDecimalPlaces(2);
        await tx.customer.update({
          where: { id: existing.customerId },
          data: { bonusBalance: { increment: bonus } },
        });
      }

      // Списані бонуси повертаються при будь-якому зриві замовлення, незалежно
      // від того, покрили вони всю суму чи лише частину.
      if (
        (status === "CANCELLED" || status === "REJECTED") &&
        existing.bonusApplied.greaterThan(0)
      ) {
        await tx.customer.update({
          where: { id: existing.customerId },
          data: { bonusBalance: { increment: existing.bonusApplied } },
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
    const action = await prisma.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({ where: { id: parsed.data.id } });
      if (!existing || (user.role !== "ADMIN" && existing.customerId !== user.id)) {
        throw httpError(404, "Order not found");
      }

      // Оплаченные заказы и CARD с заявленной оплатой не удаляются: нужны
      // заказ, платёжный след и подтверждение возраста для сверки/возврата.
      // Полностью бонусный заказ тоже PAID, но денег там нет — его отменяем
      // ниже с возвратом баланса.
      const paidWithMoney = existing.totalAmount.sub(existing.bonusApplied).greaterThan(0);
      if (
        paidWithMoney &&
        (existing.paymentStatus === "PAID" ||
          (existing.paymentMethod === "CARD" && existing.paymentStatus !== "PENDING"))
      ) {
        throw httpError(409, "Order has a claimed or confirmed payment and cannot be deleted");
      }

      // Бонусы списаны при оформлении, поэтому отмена сохраняет заказ и
      // AgeVerification, а баланс возвращает атомарно: переход NEW -> CANCELLED
      // проходит один раз, так что повтор/гонка не начислит возврат дважды.
      if (existing.bonusApplied.greaterThan(0)) {
        const cancelled = await tx.order.updateMany({
          where: { id: existing.id, status: "NEW" },
          data: { status: "CANCELLED", paymentAmountKey: null, nextCheckAt: null },
        });
        if (cancelled.count === 0) {
          throw httpError(409, "Only orders with status NEW can be cancelled");
        }
        await tx.customer.update({
          where: { id: existing.customerId },
          data: { bonusBalance: { increment: existing.bonusApplied } },
        });
        return "cancelled" as const;
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
      return "deleted" as const;
    });
    log.info({ orderId: parsed.data.id, customerId: user.id, action }, "Order cancellation completed");
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
