import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { upload } from "../middleware/upload.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { imageUrlSchema, replaceImageSchema } from "../schemas/images.js";
import { processUpload } from "../lib/processImage.js";
import log from "../logger.js";

const router = Router();

function toDiskPath(url: string): string | null {
  const resolved = path.resolve(url.slice(1));
  const uploadsDir = path.resolve("uploads");
  if (!resolved.startsWith(uploadsDir + path.sep) && resolved !== uploadsDir) {
    return null;
  }
  return resolved;
}

// POST /api/v1/images/upload — multer single "image", конвертация в WebP, return { url }
async function uploadImage(req: Request, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image provided" });
    }

    const url = await processUpload(req.file);
    res.status(201).json({ url });
  } catch (error) {
    // Битый файл с валидным mime — клиентская ошибка, не 500. Оригинал
    // уже удалён processUpload, мусор на диске не оседает.
    log.warn({ err: error }, "image processing failed");
    res.status(400).json({ error: "Не вдалося обробити зображення" });
  }
}

// POST /api/v1/images/replace — multer single "image" + body.oldUrl
// Delete old file, convert new to WebP, return { url }
async function replaceImage(req: Request, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image provided" });
    }

    const parsed = replaceImageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues });
    }

    const oldPath = toDiskPath(parsed.data.oldUrl);
    if (oldPath) {
      await fs.unlink(oldPath).catch(() => {});
    }

    const url = await processUpload(req.file);
    res.status(201).json({ url });
  } catch (error) {
    log.warn({ err: error }, "image processing failed");
    res.status(400).json({ error: "Не вдалося обробити зображення" });
  }
}

// DELETE /api/v1/images — body { url }, delete file from disk
async function deleteImage(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = imageUrlSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.issues });
    }

    const diskPath = toDiskPath(parsed.data.url);
    if (diskPath) {
      await fs.unlink(diskPath).catch(() => {});
    }

    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

router.post(
  "/upload",
  requireAuth,
  requireAdmin,
  upload.single("image"),
  uploadImage,
);
router.post(
  "/replace",
  requireAuth,
  requireAdmin,
  upload.single("image"),
  replaceImage,
);
router.delete("/", requireAuth, requireAdmin, deleteImage);

export default router;
