import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import prisma from "../prisma.js";
import {
  orderParamsSchema,
  createOrderSchema,
  updateOrderSchema,
} from "../schemas/orders.js";

const router = Router();

// GET /api/orders
async function getOrders(_req: Request, res: Response, next: NextFunction) {
  try {
    const orders = await prisma.order.findMany({
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

// GET /api/orders/:id
async function getOrderById(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = orderParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues });
    }

    const order = await prisma.order.findUnique({
      where: { id: parsed.data.id },
      include: {
        customer: true,
        items: { include: { product: true } },
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json(order);
  } catch (error) {
    next(error);
  }
}

// POST /api/orders
async function createOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues });
    }

    const { customerId, paymentMethod, items } = parsed.data;

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const productIds = items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    if (products.length !== productIds.length) {
      return res.status(404).json({ error: "One or more products not found" });
    }

    const productMap = new Map(products.map((p) => [p.id, p]));
    let totalAmount = 0;
    const orderItems = items.map((item) => {
      const product = productMap.get(item.productId)!;
      const price = product.price;
      totalAmount += Number(price) * item.quantity;
      return { productId: item.productId, quantity: item.quantity, price };
    });

    const order = await prisma.order.create({
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

    res.status(201).json(order);
  } catch (error) {
    next(error);
  }
}

// PUT /api/orders/:id
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

    const existing = await prisma.order.findUnique({
      where: { id: parsedParams.data.id },
    });
    if (!existing) {
      return res.status(404).json({ error: "Order not found" });
    }

    const data = Object.fromEntries(
      Object.entries(parsedBody.data).filter(([_, v]) => v !== undefined),
    ) as Record<string, unknown>;

    const order = await prisma.order.update({
      where: { id: parsedParams.data.id },
      data,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        items: { include: { product: true } },
      },
    });

    res.json(order);
  } catch (error) {
    next(error);
  }
}

// DELETE /api/orders/:id
async function deleteOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = orderParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues });
    }

    const existing = await prisma.order.findUnique({
      where: { id: parsed.data.id },
    });
    if (!existing) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (existing.status !== "NEW") {
      return res.status(409).json({
        error: "Only orders with status NEW can be cancelled",
      });
    }

    await prisma.order.delete({ where: { id: parsed.data.id } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

router.get("/", getOrders);
router.get("/:id", getOrderById);
router.post("/", createOrder);
router.put("/:id", updateOrder);
router.delete("/:id", deleteOrder);

export default router;
