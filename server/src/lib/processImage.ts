import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";

// ponytail: один варіант на аплоад — 1600px WebP покриває і картку 150px,
// і детальну сторінку (2x retina). Тумбнейл 400px + srcset — коли вага
// карткової сітки стане окремою проблемою від ваги сторінки товару.
const MAX_DIM = 1600;
const WEBP_QUALITY = 80;

// Аплоад мультером вже лежить на диску: конвертуємо в WebP поряд,
// оригінал видаляємо. При помилці оригінал теж видаляємо — інакше на диску
// осідають сирі багатомегабайтні файли, які ніхто не бачить.
//
// Запис через tmp + rename: вхід уже може бути .webp (outPath === file.path),
// писати наживо в файл, який читає libvips, — ризик SIGBUS при mmap.
export async function processUpload(file: Express.Multer.File): Promise<string> {
  const dir = path.dirname(file.path);
  const base = path.basename(file.path, path.extname(file.path));
  const outPath = path.join(dir, `${base}.webp`);
  const tmpPath = path.join(dir, `.${base}.tmp.webp`);
  try {
    // failOn: "none" — mime з клієнта брехня, sharp переживає битий файл,
    // а не валить процес. rotate() читає EXIF: фото з телефона інакше
    // лягає боком (реальний хардвар, не спеку).
    await sharp(file.path, { failOn: "none" })
      .rotate()
      .resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toFile(tmpPath);
    await fs.rename(tmpPath, outPath);
  } catch (error) {
    await fs.unlink(tmpPath).catch(() => {});
    await fs.unlink(file.path).catch(() => {});
    throw error;
  }
  if (outPath !== file.path) {
    // WebP уже готов и валиден: если unlink оригинала упадёт, бросать нельзя —
    // маршрут вернёт 400, а готовый файл останется нигде не записанным.
    await fs.unlink(file.path).catch(() => {});
  }
  return `/uploads/${base}.webp`;
}
