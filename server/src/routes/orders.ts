import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../prisma.js";
import { httpError } from "../lib/httpError.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import {
  orderParamsSchema,
  createOrderSchema,
  isOrderTotalValid,
  updateOrderSchema,
} from "../schemas/orders.js";

const router = Router();

// GET /api/v1/orders — ADMIN видит все, CUSTOMER только свои.
async function getOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user!;
    const orders = await prisma.order.findMany({
      where: user.role === "ADMIN" ? {} : { customerId: user.id },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        items: { include: { product: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(orders);
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
    const { paymentMethod, items } = parsed.data;
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

      return tx.order.create({
        data: {
          customerId,
          paymentMethod,
          totalAmount,
          items: { create: orderItems },
        },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          items: { include: { product: true } },
        },
      });
    });

    res.status(201).json(order);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return next(httpError(404, "Customer or product not found"));
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

    const order = await prisma.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({ where: { id } });
      if (!existing) {
        throw httpError(404, "Order not found");
      }
      if (existing.status === "COMPLETED" && status !== "COMPLETED") {
        throw httpError(409, "Completed orders cannot be changed");
      }

      if (existing.status !== "COMPLETED") {
        const updated = await tx.order.updateMany({
          where: { id, status: { not: "COMPLETED" } },
          data: { status },
        });

        if (updated.count === 0) {
          const current = await tx.order.findUnique({ where: { id } });
          if (!current) {
            throw httpError(404, "Order not found");
          }
          if (status !== "COMPLETED") {
            throw httpError(409, "Completed orders cannot be changed");
          }
        } else if (status === "COMPLETED" && existing.paymentMethod !== "BONUS") {
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
      }

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

      const deleted = await tx.order.deleteMany({
        where: { id: parsed.data.id, status: "NEW" },
      });
      if (deleted.count === 0) {
        throw httpError(409, "Only orders with status NEW can be cancelled");
      }

      if (existing.paymentMethod === "BONUS") {
        await tx.customer.update({
          where: { id: existing.customerId },
          data: { bonusBalance: { increment: existing.totalAmount } },
        });
      }
    });
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
