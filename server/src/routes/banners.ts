import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import prisma from "../prisma.js";
import log from "../logger.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import {
  createBannerSchema,
  updateBannerSchema,
  bannerParamsSchema,
  reorderBannersSchema,
} from "../schemas/banners.js";

const router = Router();

const BANNER_FIELDS = {
  id: true,
  imageUrl: true,
  link: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
} as const;

// /uploads/<filename> — безпечний шлях до файлу на диску, ідентичний
// images.ts:13-20; повертає null якщо url не в /uploads/ (path traversal).
function toDiskPath(url: string): string | null {
  const resolved = path.resolve(url.slice(1));
  const uploadsDir = path.resolve("uploads");
  if (!resolved.startsWith(uploadsDir + path.sep) && resolved !== uploadsDir) {
    return null;
  }
  return resolved;
}

// GET /api/banners — публічний, тільки активні, у порядку sortOrder.
async function getBanners(req: Request, res: Response, next: NextFunction) {
  try {
    const includeInactive = req.query.includeInactive === "true";

    const banners = await prisma.banner.findMany({
      where: includeInactive ? {} : { isActive: true },
      // sortOrder визначає порядок у каруселі; createdAt — стабілізує порядок
      // при рівних sortOrder, інакше Postgres повертає рядки у довільному
      // порядку і порядок «стрибає» між запитами.
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      select: BANNER_FIELDS,
    });

    res.json(banners);
  } catch (error) {
    next(error);
  }
}

// POST /api/banners — створити. Адмін вже завантажив файл через /api/v1/images/upload
// і передає готовий /uploads/...webp URL.
async function createBanner(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createBannerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues });
    }

    const { imageUrl, link, sortOrder, isActive } = parsed.data;
    const banner = await prisma.banner.create({
      data: {
        imageUrl,
        ...(link !== undefined && { link }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(isActive !== undefined && { isActive }),
      },
      select: BANNER_FIELDS,
    });

    log.info({ bannerId: banner.id, hasLink: banner.link !== null }, "Banner created");
    res.status(201).json(banner);
  } catch (error) {
    next(error);
  }
}

// PATCH /api/banners/:id — часткове оновлення. link: null знімає кликабельність.
async function updateBanner(req: Request, res: Response, next: NextFunction) {
  try {
    const paramsParsed = bannerParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      return res.status(400).json({ errors: paramsParsed.error.issues });
    }

    const bodyParsed = updateBannerSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      return res.status(400).json({ errors: bodyParsed.error.issues });
    }

    const { imageUrl, link, sortOrder, isActive } = bodyParsed.data;

    const banner = await prisma.banner.update({
      where: { id: paramsParsed.data.id },
      data: {
        ...(imageUrl !== undefined && { imageUrl }),
        ...(link !== undefined && { link }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(isActive !== undefined && { isActive }),
      },
      select: BANNER_FIELDS,
    });

    log.info({ bannerId: banner.id, isActive: banner.isActive }, "Banner updated");
    res.json(banner);
  } catch (error) {
    next(error);
  }
}

// DELETE /api/banners/:id — видалити запис і файл з диску. Атомарності нема
// (БД-транзакція + fs.unlink — різні системи), але link не посилається на
// банер: навіть при осиротілому файлі користувач нічого не помітить.
async function deleteBanner(req: Request, res: Response, next: NextFunction) {
  try {
    const paramsParsed = bannerParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      return res.status(400).json({ errors: paramsParsed.error.issues });
    }

    const existing = await prisma.banner.findUnique({
      where: { id: paramsParsed.data.id },
      select: { id: true, imageUrl: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "Banner not found" });
    }

    await prisma.banner.delete({ where: { id: existing.id } });

    const diskPath = toDiskPath(existing.imageUrl);
    if (diskPath) {
      await fs.unlink(diskPath).catch(() => {});
    }

    log.info({ bannerId: existing.id }, "Banner deleted");
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

// POST /api/banners/reorder — body { ids: string[] } у новому порядку.
// Поза транзакцією: якщо запит впаде посеред процесу, sortOrder залишиться
// частково переписаним, але БД-консистентності це не ламає — банер завжди
// відображається, просто порядок може тимчасово «поплисти».
async function reorderBanners(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = reorderBannersSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues });
    }

    const { ids } = parsed.data;
    await Promise.all(
      ids.map((id, index) =>
        prisma.banner.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    log.info({ count: ids.length }, "Banners reordered");
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

router.get("/", getBanners);
router.post("/", requireAuth, requireAdmin, createBanner);
router.patch("/:id", requireAuth, requireAdmin, updateBanner);
router.delete("/:id", requireAuth, requireAdmin, deleteBanner);
router.post("/reorder", requireAuth, requireAdmin, reorderBanners);

export default router;
