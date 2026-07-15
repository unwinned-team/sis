// Products router — mounted at /api/products
//
// GET /
//   - optional query: ?categoryId=... (filter by category)
//   - respond 200 with [{ id, name, price, imageUrl, category }] ordered by name
//
// GET /:id
//   - validate params with productParamsSchema
//   - respond 200 with product + category, or 404 if missing
//
// POST /
//   - validate body with createProductSchema (name, description, price, categoryId, imageUrl)
//   - create product in DB
//   - respond 201 with created product
//
// PUT /:id
//   - validate params with productParamsSchema, body with updateProductSchema
//   - update product in DB, 404 if missing
//   - respond 200 with updated product
//
// DELETE /:id
//   - validate params with productParamsSchema
//   - delete product from DB, 404 if missing
//   - respond 204 no content
//
// GET /:id/related
//   - validate params with productParamsSchema
//   - find products in same category (excluding current), limit 4
//   - respond 200 with related products, or 404 if product not found

import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import prisma from "../prisma.js";
import {
  productParamsSchema,
  createProductSchema,
  updateProductSchema,
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

// GET /api/products
async function getProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const { categoryId } = req.query;

    const products = await prisma.product.findMany({
      where: categoryId ? { categoryId: String(categoryId) } : {},
      orderBy: { name: "asc" },
      include: { category: true },
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
      include: { category: true },
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
  try {
    const parsed = productParamsSchema.safeParse(req.params);

    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues });
    }

    const existing = await prisma.product.findUnique({
      where: { id: parsed.data.id },
    });

    if (!existing) {
      return res.status(404).json({ error: "Product not found" });
    }

    const orderItems = await prisma.orderItem.count({
      where: { productId: parsed.data.id },
    });

    if (orderItems > 0) {
      return res.status(409).json({
        error:
          "Product cannot be deleted because it is used in existing orders",
      });
    }

    await prisma.product.delete({ where: { id: parsed.data.id } });

    res.status(204).end();
  } catch (error) {
    if (isForeignKeyConstraintViolation(error)) {
      return res.status(409).json({
        error:
          "Product cannot be deleted because it is used in existing orders",
      });
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

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const related = await prisma.product.findMany({
      where: {
        categoryId: product.categoryId,
        id: { not: product.id },
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

router.get("/", getProducts);
router.get("/:id", getProductById);
router.post("/", createProduct);
router.put("/:id", updateProduct);
router.delete("/:id", deleteProduct);
router.get("/:id/related", getRelatedProducts);

export default router;
