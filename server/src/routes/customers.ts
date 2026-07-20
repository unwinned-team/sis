import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../prisma.js";
import { httpError } from "../lib/httpError.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import {
  customerParamsSchema,
  listCustomersQuerySchema,
  createCustomerSchema,
  updateCustomerSchema,
  updateCustomerRoleSchema,
  updateCustomerActiveSchema,
} from "../schemas/customers.js";

const router = Router();

// Весь CRUD клиентов — back-office; самообслуживание через /api/v1/auth/me.
router.use(requireAuth, requireAdmin);

// Явный select: без него в выдачу уходят passwordHash и totpSecret.
const CUSTOMER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  bonusBalance: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

// GET /api/customers?role=&take=&skip=
// Ответ остаётся массивом (контракт существующих потребителей и тестов);
// пагинация ограничивает выборку, но обёртку {customers,total} не вводит.
async function getCustomers(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = listCustomersQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues });
    }

    const { role, take, skip } = parsed.data;

    const customers = await prisma.customer.findMany({
      where: role ? { role } : {},
      orderBy: { createdAt: "desc" },
      select: CUSTOMER_SELECT,
      ...(take !== undefined && { take }),
      ...(skip !== undefined && { skip }),
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

// Понижение/блокировка админа — единственный путь остаться без единого админа,
// а API-пути обратно нет: чинить пришлось бы руками в БД. Поэтому обе операции
// проходят через общую проверку «это не последний активный админ».
async function assertNotLastActiveAdmin(tx: Prisma.TransactionClient, id: string) {
  const remaining = await tx.customer.count({
    where: { role: "ADMIN", isActive: true, id: { not: id } },
  });
  if (remaining === 0) {
    throw httpError(409, "Cannot demote or deactivate the last active admin");
  }
}

// Сессия остаётся живой после понижения: requireAdmin ходит в БД и отсечёт
// доступ сразу, но refresh-токен продолжил бы выдавать новые access-токены.
async function revokeAllSessions(tx: Prisma.TransactionClient, customerId: string) {
  await tx.refreshToken.updateMany({
    where: { customerId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// PATCH /api/customers/:id/role
async function updateCustomerRole(req: Request, res: Response, next: NextFunction) {
  try {
    const parsedParams = customerParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return res.status(400).json({ errors: parsedParams.error.issues });
    }

    const parsedBody = updateCustomerRoleSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({ errors: parsedBody.error.issues });
    }

    const { id } = parsedParams.data;
    const { role } = parsedBody.data;

    // Иначе админ разлогинит сам себя одним кликом и не сможет вернуться.
    if (id === req.user!.id) {
      return res.status(403).json({ error: "Cannot change your own role" });
    }

    const customer = await prisma.$transaction(async (tx) => {
      const existing = await tx.customer.findUnique({
        where: { id },
        select: { role: true },
      });
      if (!existing) {
        throw httpError(404, "Customer not found");
      }

      if (existing.role === "ADMIN" && role === "CUSTOMER") {
        await assertNotLastActiveAdmin(tx, id);
        await revokeAllSessions(tx, id);
      }

      return tx.customer.update({
        where: { id },
        data: { role },
        select: CUSTOMER_SELECT,
      });
    });

    res.json(customer);
  } catch (error) {
    next(error);
  }
}

// PATCH /api/customers/:id/active
async function updateCustomerActive(req: Request, res: Response, next: NextFunction) {
  try {
    const parsedParams = customerParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return res.status(400).json({ errors: parsedParams.error.issues });
    }

    const parsedBody = updateCustomerActiveSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({ errors: parsedBody.error.issues });
    }

    const { id } = parsedParams.data;
    const { isActive } = parsedBody.data;

    if (id === req.user!.id) {
      return res.status(403).json({ error: "Cannot block yourself" });
    }

    const customer = await prisma.$transaction(async (tx) => {
      const existing = await tx.customer.findUnique({
        where: { id },
        select: { role: true },
      });
      if (!existing) {
        throw httpError(404, "Customer not found");
      }

      if (!isActive) {
        if (existing.role === "ADMIN") {
          await assertNotLastActiveAdmin(tx, id);
        }
        await revokeAllSessions(tx, id);
      }

      return tx.customer.update({
        where: { id },
        data: { isActive },
        select: CUSTOMER_SELECT,
      });
    });

    res.json(customer);
  } catch (error) {
    next(error);
  }
}

router.get("/", getCustomers);
router.get("/:id", getCustomerById);
router.post("/", createCustomer);
router.put("/:id", updateCustomer);
router.patch("/:id/role", updateCustomerRole);
router.patch("/:id/active", updateCustomerActive);
router.delete("/:id", deleteCustomer);
router.get("/:id/orders", getCustomerOrders);

export default router;
