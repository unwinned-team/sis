import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import prisma from "../prisma.js";
import log from "../logger.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import {
  productParamsSchema,
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

// Публичные GET-роуты скрывают архив; ?includeArchived=true доступен только
// админу, поэтому цепочка auth-middleware включается лишь при этом параметре.
function requireAdminForArchived(req: Request, res: Response, next: NextFunction) {
  if (req.query.includeArchived !== "true") {
    return next();
  }
  requireAuth(req, res, (err?: unknown) => {
    if (err) return next(err);
    requireAdmin(req, res, next);
  });
}

// GET /api/products
async function getProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const { categoryId } = req.query;
    const includeArchived = req.query.includeArchived === "true";

    const products = await prisma.product.findMany({
      where: {
        ...(includeArchived ? {} : { isArchived: false }),
        ...(categoryId ? { categoryId: String(categoryId) } : {}),
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

    const includeArchived = req.query.includeArchived === "true";

    const product = await prisma.product.findFirst({
      where: {
        id: parsed.data.id,
        ...(includeArchived ? {} : { isArchived: false }),
      },
      include: { category: true, variants: true },
    });

    if (!product) {
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

    const product = await prisma.product.create({
      data: parsed.data,
      include: { category: true },
    });

    log.info({ productId: product.id, categoryId: product.categoryId }, "Product created");
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

    log.info({ productId: product.id }, "Product updated");
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

  const id = parsed.data.id;

  try {
    const existing = await prisma.product.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: "Product not found" });
    }

    const orderItems = await prisma.orderItem.count({
      where: { productId: id },
    });

    if (orderItems > 0) {
      return archiveProduct(id, res);
    }

    await prisma.product.delete({ where: { id } });

    log.info({ productId: id }, "Product deleted");
    res.status(204).end();
  } catch (error) {
    if (isForeignKeyConstraintViolation(error)) {
      return archiveProduct(id, res);
    }

    next(error);
  }
}

// updateMany вместо update: товар мог быть удалён параллельным запросом между
// проверкой и записью — тогда отвечаем 404, а не падаем в 500 на P2025.
async function archiveProduct(id: string, res: Response) {
  const archived = await prisma.product.updateMany({
    where: { id },
    data: { isArchived: true },
  });

  if (archived.count === 0) {
    return res.status(404).json({ error: "Product not found" });
  }

  log.info({ productId: id }, "Product archived (has order items)");
  res.json({ archived: true });
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

    const product = await prisma.product.findFirst({
      where: { id: parsed.data.id, isArchived: false },
    });

    if (!product) {
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

// POST /api/products/:productId/variants
async function createVariant(req: Request, res: Response, next: NextFunction) {
  try {
    const parsedParams = variantParamsSchema.safeParse(req.params);

    if (!parsedParams.success) {
      return res.status(400).json({ errors: parsedParams.error.issues });
    }

    const parsedBody = createVariantSchema.safeParse(req.body);

    if (!parsedBody.success) {
      return res.status(400).json({ errors: parsedBody.error.issues });
    }

    const product = await prisma.product.findUnique({
      where: { id: parsedParams.data.productId },
    });

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const variant = await prisma.productVariant.create({
      data: {
        productId: parsedParams.data.productId,
        price: parsedBody.data.price,
        taste: parsedBody.data.taste ?? null,
        size: parsedBody.data.size ?? null,
        description: parsedBody.data.description ?? null,
      },
    });

    log.info({ variantId: variant.id, productId: parsedParams.data.productId }, "Variant created");
    res.status(201).json(variant);
  } catch (error) {
    next(error);
  }
}

// PUT /api/products/:productId/variants/:variantId
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

    const product = await prisma.product.findUnique({
      where: { id: parsedParams.data.productId },
    });

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const existing = await prisma.productVariant.findUnique({
      where: { id: parsedParams.data.variantId },
    });

    if (!existing || existing.productId !== parsedParams.data.productId) {
      return res.status(404).json({ error: "Variant not found" });
    }

    const data = Object.fromEntries(
      Object.entries(parsedBody.data).filter(([_, v]) => v !== undefined),
    );

    const variant = await prisma.productVariant.update({
      where: { id: parsedParams.data.variantId },
      data,
    });

    log.info({ variantId: variant.id, productId: parsedParams.data.productId }, "Variant updated");
    res.json(variant);
  } catch (error) {
    next(error);
  }
}

// DELETE /api/products/:productId/variants/:variantId
async function deleteVariant(req: Request, res: Response, next: NextFunction) {
  try {
    const parsedParams = variantParamsSchema.safeParse(req.params);

    if (!parsedParams.success) {
      return res.status(400).json({ errors: parsedParams.error.issues });
    }

    const product = await prisma.product.findUnique({
      where: { id: parsedParams.data.productId },
    });

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const existing = await prisma.productVariant.findUnique({
      where: { id: parsedParams.data.variantId },
    });

    if (!existing || existing.productId !== parsedParams.data.productId) {
      return res.status(404).json({ error: "Variant not found" });
    }

    await prisma.productVariant.delete({
      where: { id: parsedParams.data.variantId },
    });

    log.info({ variantId: parsedParams.data.variantId, productId: parsedParams.data.productId }, "Variant deleted");
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

router.get("/", requireAdminForArchived, getProducts);
router.get("/:id", requireAdminForArchived, getProductById);
router.post("/", requireAuth, requireAdmin, createProduct);
router.put("/:id", requireAuth, requireAdmin, updateProduct);
router.delete("/:id", requireAuth, requireAdmin, deleteProduct);
router.get("/:id/related", getRelatedProducts);
router.post("/:productId/variants", requireAuth, requireAdmin, createVariant);
router.put("/:productId/variants/:variantId", requireAuth, requireAdmin, updateVariant);
router.delete("/:productId/variants/:variantId", requireAuth, requireAdmin, deleteVariant);

export default router;
