import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import prisma from "../prisma.js";
import log from "../logger.js";
import {
  requireAuth,
  requireAdmin,
  requireAdminForArchived,
} from "../middleware/auth.js";
import { VISIBLE_PRODUCT } from "../lib/visibility.js";
import {
  popularProductParamsSchema,
  createCategorySchema,
  updateCategorySchema,
  categoryParamsSchema,
} from "../schemas/categories.js";

const router = Router();

const CATEGORY_FIELDS = {
  id: true,
  name: true,
  slug: true,
  imageUrl: true,
  isArchived: true,
  tasteLabel: true,
} as const;

// GET /api/categories
async function getCategories(req: Request, res: Response, next: NextFunction) {
  try {
    const categories = await prisma.category.findMany({
      where: req.query.includeArchived === "true" ? {} : { isArchived: false },
      orderBy: { name: "asc" },
      select: CATEGORY_FIELDS,
    });

    res.json(categories);
  } catch (error) {
    next(error);
  }
}

// GET /api/categories/:slug/popular-product
async function getCategoryPopularProduct(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsed = popularProductParamsSchema.safeParse(req.params);

    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues });
    }

    const { slug } = parsed.data;

    const category = await prisma.category.findUnique({
      where: { slug },
      select: { id: true, isArchived: true },
    });

    if (!category || category.isArchived) {
      return res.status(404).json({ error: "Category not found" });
    }

    const topItem = await prisma.orderItem.groupBy({
      by: ["productId"],
      where: { product: { categoryId: category.id, ...VISIBLE_PRODUCT } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 1,
    });

    if (!topItem.length) {
      return res.status(404).json({ error: "No orders in this category" });
    }

    const product = await prisma.product.findFirst({
      where: { id: topItem[0]!.productId, ...VISIBLE_PRODUCT },
      include: {
        category: true,
        // Без orderBy Postgres віддає оновлені рядки в кінці — смаки
        // стрибали б у списку після кожного редагування.
        variants: { orderBy: { id: "asc" } },
      },
    });

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(product);
  } catch (error) {
    next(error);
  }
}

async function createCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues });
    }

    const category = await prisma.category.create({
      data: {
        name: parsed.data.name,
        slug: parsed.data.slug,
        ...(parsed.data.imageUrl !== undefined && {
          imageUrl: parsed.data.imageUrl,
        }),
        ...(parsed.data.tasteLabel !== undefined && {
          tasteLabel: parsed.data.tasteLabel,
        }),
      },
      select: CATEGORY_FIELDS,
    });

    log.info(
      { categoryId: category.id, slug: category.slug, name: category.name },
      "Category created",
    );
    res.status(201).json(category);
  } catch (error) {
    next(error);
  }
}

async function updateCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const paramsParsed = categoryParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      return res.status(400).json({ errors: paramsParsed.error.issues });
    }

    const bodyParsed = updateCategorySchema.safeParse(req.body);
    if (!bodyParsed.success) {
      return res.status(400).json({ errors: bodyParsed.error.issues });
    }

    const existing = await prisma.category.findUnique({
      where: { slug: paramsParsed.data.slug },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ error: "Category not found" });
    }

    const { name, slug, imageUrl, isArchived, tasteLabel } = bodyParsed.data;

    const category = await prisma.category.update({
      where: { slug: paramsParsed.data.slug },
      data: {
        ...(name !== undefined && { name }),
        ...(slug !== undefined && { slug }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(isArchived !== undefined && { isArchived }),
        ...(tasteLabel !== undefined && { tasteLabel }),
      },
      select: CATEGORY_FIELDS,
    });

    log.info(
      { categoryId: category.id, slug: category.slug, isArchived: category.isArchived },
      "Category updated",
    );
    res.json(category);
  } catch (error) {
    next(error);
  }
}

async function deleteCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = categoryParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues });
    }

    const category = await prisma.category.findUnique({
      where: { slug: parsed.data.slug },
      select: { id: true, _count: { select: { products: true } } },
    });

    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    if (category._count.products > 0) {
      return res.status(409).json({
        error:
          "Cannot delete category with existing products — archive it instead",
      });
    }

    await prisma.category.delete({ where: { id: category.id } });

    log.info(
      { categoryId: category.id, slug: parsed.data.slug },
      "Category deleted",
    );
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

router.get("/", requireAdminForArchived, getCategories);
router.get("/:slug/popular-product", getCategoryPopularProduct);
router.post("/", requireAuth, requireAdmin, createCategory);
router.put("/:slug", requireAuth, requireAdmin, updateCategory);
router.delete("/:slug", requireAuth, requireAdmin, deleteCategory);

export default router;
