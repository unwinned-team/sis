import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import prisma from "../prisma.js";
import { popularProductParamsSchema } from "../schemas/categories.js";

const router = Router();

// GET /api/categories
async function getCategories(_req: Request, res: Response, next: NextFunction) {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
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

router.get("/", getCategories);
router.get("/:slug/popular-product", getCategoryPopularProduct);

export default router;
