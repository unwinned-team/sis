require("dotenv/config");

const { randomBytes, scryptSync } = require("node:crypto");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const {
  categories,
  products,
  productVariants,
} = require("./catalog.cjs");

const money = (cents) => (cents / 100).toFixed(2);
const atNoon = (date) => new Date(`${date}T12:00:00.000Z`);

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$32768$8$1$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

// Аккаунты, которые становятся администраторами после сида.
//
// Чтобы выдать кому-то права — добавьте сюда запись с его почтой и выполните
// `npm run server:db:seed`. Через API повысить до админа тоже можно
// (PATCH /api/v1/customers/:id/role), этот список — про состояние «из коробки».
//
// Поля:
//   id          — идентификатор записи (любая стабильная строка);
//   name        — отображаемое имя;
//   email       — логин, он же ключ: запись с такой почтой станет ADMIN;
//   passwordEnv — необязательно: имя переменной окружения с личным паролем.
//                 Если не указано, берётся общий SEED_ADMIN_PASSWORD.
const admins = [
  { id: "customer-admin-unwinned",
    name: "unwinned.",
    email: "alo337619@gmail.com",
    passwordEnv: "UNWINNED_ADMIN_PASSWORD"
  },
    { id: "customer-admin-stass",
    name: "Стass",
    email: "staskozlovec5@gmail.com",
    passwordEnv: "STASS_ADMIN_PASSWORD"
  },
  { id: "customer-admin-bogdan",
    name: "Bogdan",
    email: "kalasnikbogdan8@gmail.com",
    passwordEnv: "BOGDAN_ADMIN_PASSWORD"
  },

  // {
  //   id: "customer-admin-owner",
  //   name: "Власник магазину",
  //   email: "owner@vapebaza.test",
  //   passwordEnv: "SEED_ADMIN_PASSWORD_OWNER",
  // },
];

const adminPassword = process.env.SEED_ADMIN_PASSWORD;

if (!adminPassword || adminPassword.trim() === "") {
  throw new Error("SEED_ADMIN_PASSWORD is required");
}

const duplicateEmail = admins
  .map((entry) => entry.email.toLowerCase())
  .find((email, index, all) => all.indexOf(email) !== index);

if (duplicateEmail) {
  throw new Error(`Duplicate admin email in seed: ${duplicateEmail}`);
}

// Пароль резолвится до записи в БД: лучше упасть до сида, чем создать половину
// админов и обнаружить незаданную переменную на середине списка.
function adminPasswordFor(entry) {
  if (!entry.passwordEnv) {
    return adminPassword;
  }

  const password = process.env[entry.passwordEnv];

  if (!password || password.trim() === "") {
    throw new Error(`${entry.passwordEnv} is required (admin ${entry.email})`);
  }

  return password;
}

async function main() {
  // Заказы, клиенты и подтверждения возраста не трогаем: сид наполняет только
  // каталог. Если товар уже попал в чей-то заказ, product.deleteMany упадёт на
  // внешнем ключе — это осознанно: лучше громкая ошибка, чем тихая потеря данных.
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();

  for (const category of categories) {
    await prisma.category.create({ data: category });
  }

  for (const product of products) {
    const { priceCents, ...data } = product;
    await prisma.product.create({
      data: {
        ...data,
        price: money(priceCents),
        createdAt: atNoon("2026-07-01"),
      },
    });
  }

  let variantCount = 0;
  for (const spec of productVariants) {
    const tastes = spec.tastes ?? [null];
    for (const taste of tastes) {
      // Смак — либо строка, либо объект с фото/доступностью конкретного смака.
      const asObject = taste && typeof taste === "object" ? taste : null;
      const tasteName = asObject?.name ?? taste;
      const tasteDesc =
        asObject?.description ??
        (taste ? spec.descriptions?.[tasteName] : null) ??
        null;
      for (const { size, priceCents } of spec.sizes) {
        await prisma.productVariant.create({
          data: {
            productId: spec.productId,
            taste: tasteName,
            size,
            price: money(priceCents),
            description: tasteDesc ?? spec.description ?? null,
            isAvailable: asObject?.isAvailable ?? true,
            // Фото смака; null — на витрине покажется общее фото товара.
            imageUrl: asObject?.imageUrl ?? null,
          },
        });
        variantCount += 1;
      }
    }
  }

  // Пароли считаются заранее — см. adminPasswordFor().
  const adminPasswords = admins.map((entry) => adminPasswordFor(entry));

  for (const [index, entry] of admins.entries()) {
    const passwordHash = hashPassword(adminPasswords[index]);

    await prisma.customer.upsert({
      where: { email: entry.email },
      create: {
        id: entry.id,
        name: entry.name,
        email: entry.email,
        role: "ADMIN",
        passwordHash,
      },
      // id в update не трогаем: если почта уже принадлежит зарегистрированному
      // клиенту, смена первичного ключа порвала бы ссылки из его заказов.
      update: { name: entry.name, role: "ADMIN", isActive: true, passwordHash },
    });
  }

  console.log(
    `Seeded ${categories.length} categories, ${products.length} products, ${variantCount} variants and ${admins.length} admin${admins.length === 1 ? "" : "s"}: ${admins.map((entry) => entry.email).join(", ")}.`,
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
