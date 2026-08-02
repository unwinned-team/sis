require("dotenv/config");

const fs = require("node:fs");
const path = require("node:path");

const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

// Витягує тексти з живої бази назад у репозиторій. Адміни пишуть описи в
// панелі, і до цього скрипта база була єдиною копією: варіант-описи існували
// лише в PostgreSQL, а в git лежали застарілі однорядкові заглушки. Через це
// `update-catalog --overwrite-text` був кнопкою знищення.
//
//   cd server && node prisma/dump-descriptions.cjs
//
// Перезаписує prisma/variant-descriptions.cjs і кладе поруч
// product-descriptions.json (описи товарів, їх update-catalog не чіпає).
// Нічого не пише в базу.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const HEADER = `// Опис кожного смаку/кольору/опору. Показується на картці товару, коли
// покупець обрав конкретний варіант, і підставляється замість опису товару.
// Ключ верхнього рівня — id товару, вкладений ключ — назва варіанта.
//
// ЗГЕНЕРОВАНО з бази: prisma/dump-descriptions.cjs. Правки роблять адміни в
// панелі, тому руками цей файл не редагують — його перегенеровують.
`;

async function main() {
  const variants = await prisma.productVariant.findMany({
    where: { description: { not: null } },
    select: { productId: true, taste: true, description: true },
    orderBy: [{ productId: "asc" }, { taste: "asc" }],
  });

  const byProduct = new Map();
  for (const { productId, taste, description } of variants) {
    // taste === null — варіант без смаку (лише розмір); описувати нічого.
    if (!taste) continue;
    if (!byProduct.has(productId)) byProduct.set(productId, []);
    byProduct.get(productId).push([taste, description]);
  }

  const body = [...byProduct]
    .map(
      ([productId, rows]) =>
        `  ${JSON.stringify(productId)}: {\n` +
        rows.map(([t, d]) => `    ${JSON.stringify(t)}: ${JSON.stringify(d)},`).join("\n") +
        `\n  },`,
    )
    .join("\n\n");

  fs.writeFileSync(
    path.join(__dirname, "variant-descriptions.cjs"),
    `${HEADER}module.exports = {\n${body}\n};\n`,
  );

  const products = await prisma.product.findMany({
    select: { id: true, description: true },
    orderBy: { id: "asc" },
  });
  fs.writeFileSync(
    path.join(__dirname, "product-descriptions.json"),
    `${JSON.stringify(Object.fromEntries(products.map((p) => [p.id, p.description])), null, 2)}\n`,
  );

  console.log(
    `variant-descriptions.cjs: ${variants.length} variants across ${byProduct.size} products`,
  );
  console.log(`product-descriptions.json: ${products.length} products`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
