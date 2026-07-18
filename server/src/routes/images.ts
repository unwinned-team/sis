import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { upload } from "../middleware/upload.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { imageUrlSchema, replaceImageSchema } from "../schemas/images.js";

const router = Router();

function toDiskPath(url: string): string | null {
  const resolved = path.resolve(url.slice(1));
  const uploadsDir = path.resolve("uploads");
  if (!resolved.startsWith(uploadsDir + path.sep) && resolved !== uploadsDir) {
    return null;
  }
  return resolved;
}

// POST /api/v1/images/upload — multer single "image", save to uploads/, return { url }
async function uploadImage(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image provided" });
    }

    const url = `/uploads/${req.file.filename}`;
    res.status(201).json({ url });
  } catch (error) {
    next(error);
  }
}

// POST /api/v1/images/replace — multer single "image" + body.oldUrl
// Delete old file, save new, return { url }
async function replaceImage(req: Request, res: Response, next: NextFunction) {
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

    const url = `/uploads/${req.file.filename}`;
    res.status(201).json({ url });
  } catch (error) {
    next(error);
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
