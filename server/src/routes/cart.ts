import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../prisma.js";
import { httpError } from "../lib/httpError.js";
import { requireAuth } from "../middleware/auth.js";
import {
  addCartItemSchema,
  cartItemParamsSchema,
  updateCartItemSchema,
  MAX_CART_ITEM_QUANTITY,
  MAX_CART_LINES,
} from "../schemas/cart.js";

const router = Router();

type Db = Prisma.TransactionClient | typeof prisma;

// Каждый эндпоинт корзины отвечает одним и тем же каноническим телом:
// фронтенд просто заменяет своё состояние ответом, без оптимистичных апдейтов.
// Недоступные (архивные/выключенные) строки остаются в списке с
// isAvailable: false, но не входят в totalQuantity/totalAmount.
async function loadCart(db: Db, customerId: string) {
  const rows = await db.cartItem.findMany({
    where: { customerId },
    include: {
      product: { include: { category: true } },
      variant: true,
    },
    orderBy: { createdAt: "asc" },
  });

  let totalQuantity = 0;
  let totalAmount = new Prisma.Decimal(0);

  const items = rows.map((row) => {
    const isAvailable = row.product.isAvailable && !row.product.isArchived;
    const unitPrice = row.variant?.price ?? row.product.price;
    const lineTotal = unitPrice.mul(row.quantity);

    if (isAvailable) {
      totalQuantity += row.quantity;
      totalAmount = totalAmount.add(lineTotal);
    }

    return {
      id: row.id,
      productId: row.productId,
      variantId: row.variantId,
      quantity: row.quantity,
      unitPrice: unitPrice.toFixed(2),
      lineTotal: lineTotal.toFixed(2),
      isAvailable,
      product: row.product,
      variant: row.variant,
    };
  });

  return { items, totalQuantity, totalAmount: totalAmount.toFixed(2) };
}

// GET /api/v1/cart — корзина текущего пользователя. Токен удалённого
// покупателя безвредно отдаёт пустую корзину.
async function getCart(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await loadCart(prisma, req.user!.id));
  } catch (error) {
    next(error);
  }
}

// POST /api/v1/cart/items — добавление инкрементирует количество существующей
// строки (semantics «добавить в корзину»); PATCH ниже — задаёт точное число.
async function addCartItem(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = addCartItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues });
    }

    const customerId = req.user!.id;
    const { productId, variantId, quantity } = parsed.data;
    const variantKey = variantId ?? "";

    const cart = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: {
          id: true,
          isAvailable: true,
          isArchived: true,
          _count: { select: { variants: true } },
        },
      });
      if (!product) {
        throw httpError(404, "Product not found");
      }

      if (!product.isAvailable || product.isArchived) {
        const err = httpError(409, "Products unavailable");
        (err as any).details = { productIds: [product.id] };
        throw err;
      }

      if (variantId) {
        // Scoped-поиск: вариант чужого товара отвечает 404, как несуществующий.
        const variant = await tx.productVariant.findFirst({
          where: { id: variantId, productId },
        });
        if (!variant) {
          throw httpError(404, "Variant not found");
        }
      } else if (product._count.variants > 0) {
        throw httpError(400, "Variant is required for this product");
      }

      // Сериализуем изменения корзины одного покупателя: count + insert должны
      // видеть результат предыдущей параллельной транзакции.
      await tx.$queryRaw`SELECT 1 FROM "Customer" WHERE "id" = ${customerId} FOR UPDATE`;

      const uniqueWhere = {
        customerId_productId_variantKey: { customerId, productId, variantKey },
      };

      const existing = await tx.cartItem.findUnique({ where: uniqueWhere });
      if (!existing) {
        const lines = await tx.cartItem.count({ where: { customerId } });
        if (lines >= MAX_CART_LINES) {
          throw httpError(409, "Cart is full");
        }
      }

      await tx.cartItem.upsert({
        where: uniqueWhere,
        update: { quantity: { increment: quantity } },
        create: {
          customerId,
          productId,
          variantId: variantId ?? null,
          variantKey,
          quantity,
        },
      });

      // Клэмп после инкремента: 999 + 999 не должно накапливаться.
      await tx.cartItem.updateMany({
        where: {
          customerId,
          productId,
          variantKey,
          quantity: { gt: MAX_CART_ITEM_QUANTITY },
        },
        data: { quantity: MAX_CART_ITEM_QUANTITY },
      });

      return loadCart(tx, customerId);
    });

    res.json(cart);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return next(httpError(404, "Customer not found"));
    }
    next(error);
  }
}

// PATCH /api/v1/cart/items/:id — задаёт точное количество. Чужая строка
// отвечает 404, а не 403, чтобы не раскрывать существование id.
async function updateCartItem(req: Request, res: Response, next: NextFunction) {
  try {
    const parsedParams = cartItemParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return res.status(400).json({ errors: parsedParams.error.issues });
    }

    const parsedBody = updateCartItemSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({ errors: parsedBody.error.issues });
    }

    const customerId = req.user!.id;
    const updated = await prisma.cartItem.updateMany({
      where: { id: parsedParams.data.id, customerId },
      data: { quantity: parsedBody.data.quantity },
    });
    if (updated.count === 0) {
      return res.status(404).json({ error: "Cart item not found" });
    }

    res.json(await loadCart(prisma, customerId));
  } catch (error) {
    next(error);
  }
}

// DELETE /api/v1/cart/items/:id — чужая строка отвечает 404, как PATCH.
async function removeCartItem(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = cartItemParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues });
    }

    const customerId = req.user!.id;
    const deleted = await prisma.cartItem.deleteMany({
      where: { id: parsed.data.id, customerId },
    });
    if (deleted.count === 0) {
      return res.status(404).json({ error: "Cart item not found" });
    }

    res.json(await loadCart(prisma, customerId));
  } catch (error) {
    next(error);
  }
}

// DELETE /api/v1/cart — идемпотентная очистка, всегда 200 с пустой корзиной.
async function clearCart(req: Request, res: Response, next: NextFunction) {
  try {
    const customerId = req.user!.id;
    await prisma.cartItem.deleteMany({ where: { customerId } });
    res.json(await loadCart(prisma, customerId));
  } catch (error) {
    next(error);
  }
}

router.get("/", requireAuth, getCart);
router.post("/items", requireAuth, addCartItem);
router.patch("/items/:id", requireAuth, updateCartItem);
router.delete("/items/:id", requireAuth, removeCartItem);
router.delete("/", requireAuth, clearCart);

export default router;
