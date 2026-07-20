import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import prisma from "../prisma.js";
import {
  requireAuth,
  requireAdmin,
  optionalAuth,
  isActiveAdmin,
} from "../middleware/auth.js";
import {
  productParamsSchema,
  listProductsQuerySchema,
  createProductSchema,
  updateProductSchema,
  variantParamsSchema,
  createVariantSchema,
  updateVariantSchema,
} from "../schemas/products.js";

const router = Router();

/**
 * Detects a foreign-key error after a related record changed between our
 * existence check and the database write. Recognizing both Prisma error shapes
 * lets the routes return a useful 404 or 409 instead of a generic 500.
 */
function isForeignKeyConstraintViolation(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const databaseError = error as {
    code?: unknown;
    name?: unknown;
    cause?: { kind?: unknown };
  };

  return (
    // Standard Prisma foreign-key error.
    databaseError.code === "P2003" ||
    // Same error returned directly by the PostgreSQL driver adapter.
    (databaseError.name === "DriverAdapterError" &&
      databaseError.cause?.kind === "ForeignKeyConstraintViolation")
  );
}

// GET /api/products — публичный. includeArchived=true работает только для
// активного админа; для всех остальных параметр молча игнорируется.
async function getProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = listProductsQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues });
    }

    const { categoryId, includeArchived } = parsed.data;

    // Роль берём не из токена, а из БД — как в requireAdmin. Проверка стоит
    // денег, поэтому выполняется только когда архив реально запрошен.
    const showArchived =
      includeArchived && req.user ? await isActiveAdmin(req.user.id) : false;

    const products = await prisma.product.findMany({
      where: {
        ...(categoryId && { categoryId }),
        ...(showArchived ? {} : { isArchived: false }),
      },
      orderBy: { name: "asc" },
      include: { category: true, variants: true },
    });

    res.json(products);
  } catch (error) {
    next(error);
  }
}

// GET /api/products/:id
async function getProductById(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = productParamsSchema.safeParse(req.params);

    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues });
    }

    const product = await prisma.product.findUnique({
      where: { id: parsed.data.id },
      include: { category: true, variants: true },
    });

    // Архивный товар для публики не существует — тот же 404, что и у несуществующего.
    if (!product || product.isArchived) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(product);
  } catch (error) {
    next(error);
  }
}

// POST /api/products
async function createProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createProductSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues });
    }

    const category = await prisma.category.findUnique({
      where: { id: parsed.data.categoryId },
      select: { id: true },
    });

    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    const { isAvailable, ...rest } = parsed.data;

    const product = await prisma.product.create({
      data: { ...rest, ...(isAvailable !== undefined && { isAvailable }) },
      include: { category: true },
    });

    res.status(201).json(product);
  } catch (error) {
    if (isForeignKeyConstraintViolation(error)) {
      return res.status(404).json({ error: "Category not found" });
    }

    next(error);
  }
}

// PUT /api/products/:id
async function updateProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const parsedParams = productParamsSchema.safeParse(req.params);

    if (!parsedParams.success) {
      return res.status(400).json({ errors: parsedParams.error.issues });
    }

    const parsedBody = updateProductSchema.safeParse(req.body);

    if (!parsedBody.success) {
      return res.status(400).json({ errors: parsedBody.error.issues });
    }

    const existing = await prisma.product.findUnique({
      where: { id: parsedParams.data.id },
    });

    if (!existing) {
      return res.status(404).json({ error: "Product not found" });
    }

    if (parsedBody.data.categoryId !== undefined) {
      const category = await prisma.category.findUnique({
        where: { id: parsedBody.data.categoryId },
        select: { id: true },
      });

      if (!category) {
        return res.status(404).json({ error: "Category not found" });
      }
    }

    const data = Object.fromEntries(
      Object.entries(parsedBody.data).filter(([_, v]) => v !== undefined),
    ) as Record<string, unknown>;

    const product = await prisma.product.update({
      where: { id: parsedParams.data.id },
      data,
      include: { category: true },
    });

    res.json(product);
  } catch (error) {
    if (isForeignKeyConstraintViolation(error)) {
      return res.status(404).json({ error: "Category not found" });
    }

    next(error);
  }
}

// DELETE /api/products/:id
async function deleteProduct(req: Request, res: Response, next: NextFunction) {
  const parsed = productParamsSchema.safeParse(req.params);

  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.issues });
  }

  try {
    const existing = await prisma.product.findUnique({
      where: { id: parsed.data.id },
    });

    if (!existing) {
      return res.status(404).json({ error: "Product not found" });
    }

    const orderItems = await prisma.orderItem.count({
      where: { productId: parsed.data.id },
    });

    // Товар с историей заказов физически удалить нельзя (OrderItem.product =
    // Restrict, и это правильно — история не должна ломаться), поэтому мягкое
    // архивирование. Клиент различает исходы по коду: 204 — удалён, 200 — в архиве.
    if (orderItems > 0) {
      await prisma.product.update({
        where: { id: parsed.data.id },
        data: { isArchived: true },
      });

      return res.status(200).json({ archived: true });
    }

    await prisma.product.delete({ where: { id: parsed.data.id } });

    res.status(204).end();
  } catch (error) {
    // Заказ на товар мог появиться между count и delete — архивируем как выше.
    if (isForeignKeyConstraintViolation(error)) {
      await prisma.product.update({
        where: { id: parsed.data.id },
        data: { isArchived: true },
      });

      return res.status(200).json({ archived: true });
    }

    next(error);
  }
}

// GET /api/products/:id/related
async function getRelatedProducts(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsed = productParamsSchema.safeParse(req.params);

    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues });
    }

    const product = await prisma.product.findUnique({
      where: { id: parsed.data.id },
    });

    if (!product || product.isArchived) {
      return res.status(404).json({ error: "Product not found" });
    }

    const related = await prisma.product.findMany({
      where: {
        categoryId: product.categoryId,
        id: { not: product.id },
        isArchived: false,
      },
      take: 4,
      orderBy: { name: "asc" },
      include: { category: true },
    });

    res.json(related);
  } catch (error) {
    next(error);
  }
}

// --- Варианты (вкусы/объёмы) ---

// Вариант всегда адресуется парой :id/:variantId — проверка принадлежности
// обязательна, иначе, зная только variantId, можно править вариант чужого товара.
async function findVariantProduct(productId: string) {
  return prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
}

// POST /api/products/:id/variants
async function createVariant(req: Request, res: Response, next: NextFunction) {
  try {
    const parsedParams = productParamsSchema.safeParse(req.params);

    if (!parsedParams.success) {
      return res.status(400).json({ errors: parsedParams.error.issues });
    }

    // Несуществующий товар — 404 до валидации тела.
    if (!(await findVariantProduct(parsedParams.data.id))) {
      return res.status(404).json({ error: "Product not found" });
    }

    const parsedBody = createVariantSchema.safeParse(req.body);

    if (!parsedBody.success) {
      return res.status(400).json({ errors: parsedBody.error.issues });
    }

    const variant = await prisma.productVariant.create({
      data: {
        productId: parsedParams.data.id,
        taste: parsedBody.data.taste ?? null,
        size: parsedBody.data.size ?? null,
        price: parsedBody.data.price,
      },
    });

    res.status(201).json(variant);
  } catch (error) {
    if (isForeignKeyConstraintViolation(error)) {
      return res.status(404).json({ error: "Product not found" });
    }

    next(error);
  }
}

// PUT /api/products/:id/variants/:variantId
async function updateVariant(req: Request, res: Response, next: NextFunction) {
  try {
    const parsedParams = variantParamsSchema.safeParse(req.params);

    if (!parsedParams.success) {
      return res.status(400).json({ errors: parsedParams.error.issues });
    }

    const parsedBody = updateVariantSchema.safeParse(req.body);

    if (!parsedBody.success) {
      return res.status(400).json({ errors: parsedBody.error.issues });
    }

    const { id, variantId } = parsedParams.data;
    const existing = await prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { productId: true },
    });

    // Вариант чужого товара неотличим от несуществующего.
    if (!existing || existing.productId !== id) {
      return res.status(404).json({ error: "Variant not found" });
    }

    const { taste, size, price } = parsedBody.data;
    const variant = await prisma.productVariant.update({
      where: { id: variantId },
      data: {
        ...(taste !== undefined && { taste }),
        ...(size !== undefined && { size }),
        ...(price !== undefined && { price }),
      },
    });

    res.json(variant);
  } catch (error) {
    next(error);
  }
}

// DELETE /api/products/:id/variants/:variantId
async function deleteVariant(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = variantParamsSchema.safeParse(req.params);

    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues });
    }

    const { id, variantId } = parsed.data;
    const existing = await prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { productId: true },
    });

    if (!existing || existing.productId !== id) {
      return res.status(404).json({ error: "Variant not found" });
    }

    await prisma.productVariant.delete({ where: { id: variantId } });

    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

router.get("/", optionalAuth, getProducts);
router.get("/:id", getProductById);
router.post("/", requireAuth, requireAdmin, createProduct);
router.put("/:id", requireAuth, requireAdmin, updateProduct);
router.delete("/:id", requireAuth, requireAdmin, deleteProduct);
router.get("/:id/related", getRelatedProducts);
router.post("/:id/variants", requireAuth, requireAdmin, createVariant);
router.put("/:id/variants/:variantId", requireAuth, requireAdmin, updateVariant);
router.delete("/:id/variants/:variantId", requireAuth, requireAdmin, deleteVariant);

export default router;
