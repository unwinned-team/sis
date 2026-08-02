require("dotenv/config");

const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

const {
  categories,
  products,
  productVariants,
  removedVariants,
} = require("./catalog.cjs");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

// За замовчуванням тексти і фото варіантів лише доповнюються, щоб не затерти
// правки з адмінки. З --overwrite-text каталог стає джерелом правди: так
// правлений catalog.cjs доїжджає до бази.
const overwriteText = process.argv.includes("--overwrite-text");

// Оновлення вітрини на живій базі: на відміну від seed.cjs нічого не видаляє,
// тому замовлення, клієнти й кошики лишаються на місці. Запускати повторно
// безпечно: другий прогін не змінює нічого.
//
//   npm run server:db:update-catalog
//
// Що робить:
//   1. заповнює порожні поля категорій (підпис характеристики, фото);
//   2. відсутні варіанти (кольори pod-систем), фото і описи для тих, у кого їх немає;
//   3. видаляє варіанти зі списку removedVariants (знято з продажу).
//
// Чого свідомо не робить: не чіпає ціни, не видаляє варіанти лише тому, що їх
// немає в каталозі, і не перезаписує НІЧОГО, що вже заповнене — ні фото, ні
// опис варіанта, ні опис товару, ні назву категорії. Каталог тільки доповнює
// порожнє; щоб він став джерелом правди, потрібен явний --overwrite-text.
async function main() {
  const stats = {
    categories: 0,
    descriptions: 0,
    variantsCreated: 0,
    variantImages: 0,
    variantDescriptions: 0,
    variantsRemoved: 0,
    missingProducts: [],
  };

  for (const category of categories) {
    const { id, ...data } = category;
    // Раніше guard стосувався лише imageUrl, а name/slug/tasteLabel каталог
    // переписував беззастережно — перейменована в панелі категорія відкочувалась
    // на кожному прогоні. Тепер правило те саме, що для варіантів і опису
    // товару: заповнюємо тільки порожнє, все інше лишаємо адмінові.
    // --overwrite-text повертає каталог джерелом правди.
    if (!overwriteText) {
      const existing = await prisma.category.findUnique({ where: { id } });
      if (existing) {
        for (const key of Object.keys(data)) {
          if (existing[key]) delete data[key];
        }
      }
    }
    // Порожній data означає, що змінювати нічого: updateMany без полів усе одно
    // порахував би рядок, і статистика брехала б про 9 оновлень щопрогону.
    if (Object.keys(data).length === 0) continue;
    const updated = await prisma.category.updateMany({ where: { id }, data });
    stats.categories += updated.count;
  }

  // Опис товару, на відміну від опису варіанта, обов'язковий — «порожній»
  // ніколи не буває, тому guard «пишемо лише в пусте» тут не працює: будь-який
  // прогін затирав би текст, написаний адміном у панелі. Тому оновлення опису
  // товару живе за --overwrite-text, як і решта перезаписів.
  if (overwriteText) {
    for (const product of products) {
      const updated = await prisma.product.updateMany({
        where: { id: product.id, description: { not: product.description } },
        data: { description: product.description },
      });
      stats.descriptions += updated.count;
    }
  }

  for (const spec of productVariants) {
    const product = await prisma.product.findUnique({
      where: { id: spec.productId },
      select: { id: true },
    });
    if (!product) {
      stats.missingProducts.push(spec.productId);
      continue;
    }

    const existing = await prisma.productVariant.findMany({
      where: { productId: spec.productId },
    });

    for (const taste of spec.tastes ?? [null]) {
      const asObject = taste && typeof taste === "object" ? taste : null;
      const tasteName = asObject?.name ?? taste;
      const description =
        asObject?.description ?? spec.descriptions?.[tasteName] ?? spec.description ?? null;

      for (const { size } of spec.sizes) {
        const match = existing.find(
          (variant) => variant.taste === tasteName && variant.size === (size ?? null),
        );

        if (!match) {
          await prisma.productVariant.create({
            data: {
              productId: spec.productId,
              taste: tasteName,
              size: size ?? null,
              isAvailable: asObject?.isAvailable ?? true,
              imageUrl: asObject?.imageUrl ?? null,
              description,
            },
          });
          stats.variantsCreated += 1;
          continue;
        }

        // Фото і опис ставимо лише тим варіантам, у яких їх ще немає: перезапис
        // затер би те, що адмін уже вніс через панель.
        if (
          asObject?.imageUrl &&
          asObject.imageUrl !== match.imageUrl &&
          (!match.imageUrl || overwriteText)
        ) {
          await prisma.productVariant.update({
            where: { id: match.id },
            data: { imageUrl: asObject.imageUrl },
          });
          stats.variantImages += 1;
        }

        if (
          description &&
          description !== match.description &&
          (!match.description || overwriteText)
        ) {
          await prisma.productVariant.update({
            where: { id: match.id },
            data: { description },
          });
          stats.variantDescriptions += 1;
        }
      }
    }
  }

  // Знятий з продажу варіант може лежати в чиємусь кошику, тому спершу
  // прибираємо його звідти: FK на CartItem інакше не дасть видалити рядок.
  for (const { productId, taste } of removedVariants) {
    const doomed = await prisma.productVariant.findMany({
      where: { productId, taste },
      select: { id: true },
    });
    if (doomed.length === 0) continue;

    const ids = doomed.map((variant) => variant.id);
    await prisma.cartItem.deleteMany({ where: { variantId: { in: ids } } });
    const deleted = await prisma.productVariant.deleteMany({ where: { id: { in: ids } } });
    stats.variantsRemoved += deleted.count;
  }

  console.log(
    [
      `Categories updated: ${stats.categories}`,
      `Descriptions updated: ${stats.descriptions}`,
      `Variants created: ${stats.variantsCreated}`,
      `Variant images filled: ${stats.variantImages}`,
      `Variant descriptions filled: ${stats.variantDescriptions}`,
      `Variants removed: ${stats.variantsRemoved}`,
      stats.missingProducts.length > 0
        ? `Skipped (product not in database): ${stats.missingProducts.join(", ")}`
        : "No missing products.",
    ].join("\n"),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
