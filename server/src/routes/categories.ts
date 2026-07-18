import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import prisma from "../prisma.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import {
  popularProductParamsSchema,
  createCategorySchema,
  updateCategorySchema,
  categoryParamsSchema,
} from "../schemas/categories.js";

const router = Router();

// GET /api/categories
async function getCategories(_req: Request, res: Response, next: NextFunction) {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, imageUrl: true },
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
      select: { id: true },
    });

    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    const topItem = await prisma.orderItem.groupBy({
      by: ["productId"],
      where: { product: { categoryId: category.id } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 1,
    });

    if (!topItem.length) {
      return res.status(404).json({ error: "No orders in this category" });
    }

    const product = await prisma.product.findUnique({
      where: { id: topItem[0]!.productId },
      include: { category: true, variants: true },
    });

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
      },
      select: { id: true, name: true, slug: true, imageUrl: true },
    });

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

    const { name, slug, imageUrl } = bodyParsed.data;

    const category = await prisma.category.update({
      where: { slug: paramsParsed.data.slug },
      data: {
        ...(name !== undefined && { name }),
        ...(slug !== undefined && { slug }),
        ...(imageUrl !== undefined && { imageUrl }),
      },
      select: { id: true, name: true, slug: true, imageUrl: true },
    });

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
      return res
        .status(409)
        .json({ error: "Cannot delete category with existing products" });
    }

    await prisma.category.delete({ where: { id: category.id } });

    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

router.get("/", getCategories);
router.get("/:slug/popular-product", getCategoryPopularProduct);
router.post("/", requireAuth, requireAdmin, createCategory);
router.put("/:slug", requireAuth, requireAdmin, updateCategory);
router.delete("/:slug", requireAuth, requireAdmin, deleteCategory);

export default router;
