// Run-once конвертация существующих изображений в WebP 1600px:
//   node server/prisma/backfill-images.cjs <dir> <url-prefix> [--no-db] [--dry-run]
//
//   <dir>        каталог с png/jpg/jpeg (конвертирует на месте)
//   <url-prefix> значение imageUrl в БД: /uploads или /images/products
//   --no-db      только файлы, БД не трогать
//   --dry-run    показать, что будет конвертировано, ничего не менять
//
// Примеры:
//   node server/prisma/backfill-images.cjs server/uploads /uploads
//   node server/prisma/backfill-images.cjs web/public/images/products /images/products
//
// Бэкап: каждый исходник копируется в <dir>/.backup-<timestamp>/ ДО
// конвертации. На проде аплоады админки в гит не попадают (server/uploads/*
// в .gitignore) — это единственная страховка, не удаляйте .backup-* до
// проверки витрины. Для /images/products бэкап тоже создаётся, но его можно
// не коммитить (gitignore покрывает .backup-*).
// .env лежит в server/, а скрипт можно запускать из любого cwd —
// path.join(__dirname, "../.env") работает независимо от места вызова.
const sharp = require("sharp");
const fs = require("node:fs/promises");
const path = require("node:path");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

require("dotenv").config({ path: path.join(__dirname, "../.env") });

const usage = `Usage: node backfill-images.cjs <dir> <url-prefix> [--no-db] [--dry-run]`;

const dir = path.resolve(process.argv[2] ?? "");
const rawPrefix = process.argv[3] ?? "";
const noDb = process.argv.includes("--no-db");
const dryRun = process.argv.includes("--dry-run");

if (!dir || !/^\/[A-Za-z0-9/_-]+$/.test(rawPrefix)) {
  console.error(usage);
  process.exit(1);
}

// Нормализуем трейлинг-слеш: /images/products и /images/products/ — одно и то же.
const prefix = rawPrefix.replace(/\/+$/, "");

const prisma = noDb
  ? null
  : new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });

const MAX_DIM = 1600;
const WEBP_QUALITY = 80;
const NAME_RE = /\.(png|jpe?g)$/i;

async function main() {
  const files = (await fs.readdir(dir)).filter((name) => NAME_RE.test(name));
  if (files.length === 0) {
    console.log(`Nothing to convert in ${dir}`);
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupDir = path.join(dir, `.backup-${stamp}`);
  const converted = [];

  for (const name of files) {
    const base = path.basename(name, path.extname(name));
    const newName = `${base}.webp`;
    const oldPath = path.join(dir, name);
    const newPath = path.join(dir, newName);
    if (dryRun) {
      console.log(`would convert ${name} -> ${newName}`);
      continue;
    }
    try {
      // Бэкап ДО конвертации: если sharp упадёт на середине, исходник
      // останется и в .backup-*, и на месте (unlink ниже не выполнится).
      await fs.mkdir(backupDir, { recursive: true });
      await fs.copyFile(oldPath, path.join(backupDir, name));
      await sharp(oldPath, { failOn: "none" })
        .rotate()
        .resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toFile(newPath);
      await fs.unlink(oldPath);
      converted.push({ oldName: name, newName });
      console.log(`converted ${name} -> ${newName}`);
    } catch (error) {
      console.error(`FAILED ${name}: ${error.message}`);
    }
  }

  if (converted.length === 0) {
    if (!dryRun) console.log(`done, backup in ${backupDir}`);
    return;
  }

  if (prisma) {
    const urlOf = (name) => `${prefix}/${name}`;
    let total = 0;
    for (const c of converted) {
      const urlBefore = urlOf(c.oldName);
      const urlAfter = urlOf(c.newName);
      for (const model of ["product", "productVariant", "category"]) {
        const { count } = await prisma[model].updateMany({
          where: { imageUrl: urlBefore },
          data: { imageUrl: urlAfter },
        });
        if (count > 0) console.log(`db: ${model} ${count}x ${urlBefore} -> ${urlAfter}`);
        total += count;
      }
    }
    console.log(`db: ${total} rows updated`);
  }

  if (prefix === "/images/products/") {
    const seedPath = path.join(__dirname, "catalog.cjs");
    let content = await fs.readFile(seedPath, "utf8");
    const before = content;
    for (const c of converted) {
      content = content.split(`"/images/products/${c.oldName}"`).join(`"/images/products/${c.newName}"`);
    }
    if (content !== before) {
      await fs.writeFile(seedPath, content);
      console.log(`catalog.cjs: ${path.basename(seedPath)} literals updated`);
    }
  }

  console.log(`${converted.length} file(s) converted, backup in ${backupDir}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
