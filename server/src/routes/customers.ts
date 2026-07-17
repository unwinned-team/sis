import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../prisma.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import {
  customerParamsSchema,
  createCustomerSchema,
  updateCustomerSchema,
} from "../schemas/customers.js";

const router = Router();

// Весь CRUD клиентов — back-office; самообслуживание через /api/v1/auth/me.
router.use(requireAuth, requireAdmin);

// GET /api/customers
async function getCustomers(_req: Request, res: Response, next: NextFunction) {
  try {
    const customers = await prisma.customer.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(customers);
  } catch (error) {
    next(error);
  }
}

// GET /api/customers/:id
async function getCustomerById(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = customerParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues });
    }

    const customer = await prisma.customer.findUnique({
      where: { id: parsed.data.id },
    });

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    res.json(customer);
  } catch (error) {
    next(error);
  }
}

// POST /api/customers
async function createCustomer(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues });
    }

    const data = {
      name: parsed.data.name,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
    };
    const customer = await prisma.customer.create({ data });
    res.status(201).json(customer);
  } catch (error) {
    next(error);
  }
}

// PUT /api/customers/:id
async function updateCustomer(req: Request, res: Response, next: NextFunction) {
  try {
    const parsedParams = customerParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return res.status(400).json({ errors: parsedParams.error.issues });
    }

    const parsedBody = updateCustomerSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({ errors: parsedBody.error.issues });
    }

    const existing = await prisma.customer.findUnique({
      where: { id: parsedParams.data.id },
    });
    if (!existing) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const data = Object.fromEntries(
      Object.entries(parsedBody.data).filter(([_, v]) => v !== undefined),
    ) as Record<string, unknown>;

    const customer = await prisma.customer.update({
      where: { id: parsedParams.data.id },
      data,
    });

    res.json(customer);
  } catch (error) {
    next(error);
  }
}

// DELETE /api/customers/:id
async function deleteCustomer(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = customerParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues });
    }

    const existing = await prisma.customer.findUnique({
      where: { id: parsed.data.id },
    });
    if (!existing) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const orderCount = await prisma.order.count({
      where: { customerId: parsed.data.id },
    });
    if (orderCount > 0) {
      return res.status(409).json({
        error: "Customer cannot be deleted because they have existing orders",
      });
    }

    await prisma.customer.delete({ where: { id: parsed.data.id } });
    res.status(204).end();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return res.status(409).json({
        error: "Customer cannot be deleted because they have existing orders",
      });
    }
    next(error);
  }
}

// GET /api/customers/:id/orders
async function getCustomerOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = customerParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues });
    }

    const customer = await prisma.customer.findUnique({
      where: { id: parsed.data.id },
    });
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const orders = await prisma.order.findMany({
      where: { customerId: parsed.data.id },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
    });

    res.json(orders);
  } catch (error) {
    next(error);
  }
}

router.get("/", getCustomers);
router.get("/:id", getCustomerById);
router.post("/", createCustomer);
router.put("/:id", updateCustomer);
router.delete("/:id", deleteCustomer);
router.get("/:id/orders", getCustomerOrders);

export default router;
