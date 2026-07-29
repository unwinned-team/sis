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
  {
    id: "customer-admin",
    name: "Ice-Shop Admin",
    email: "admin@example.test",
    passwordEnv: "SEED_ADMIN_PASSWORD",
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





const customers = [
  {
    id: "customer-olena",
    name: "Олена Коваль",
    email: "olena@example.com",
    phone: "+380501110001",
    bonusBalance: "120.00",
    createdAt: atNoon("2026-06-20"),
  },
  {
    id: "customer-dmytro",
    name: "Дмитро Мельник",
    email: "dmytro@example.com",
    phone: "+380501110002",
    bonusBalance: "75.50",
    createdAt: atNoon("2026-06-22"),
  },
  {
    id: "customer-maria",
    name: "Марія Шевченко",
    email: "maria@example.com",
    phone: "+380501110003",
    bonusBalance: "0.00",
    createdAt: atNoon("2026-06-25"),
  },
  {
    id: "customer-artem",
    name: "Артем Бондар",
    email: "artem@example.com",
    phone: "+380501110004",
    bonusBalance: "250.00",
    createdAt: atNoon("2026-06-28"),
  },
  {
    id: "customer-guest-phone",
    name: "Гість з телефоном",
    email: null,
    phone: "+380501110005",
    bonusBalance: "15.00",
    createdAt: atNoon("2026-07-01"),
  },
  {
    id: "customer-ivan",
    name: "Іван Гриценко",
    email: "ivan@example.com",
    phone: "+380501110006",
    bonusBalance: "500.00",
    createdAt: atNoon("2026-07-03"),
  },
  {
    id: "customer-natalia",
    name: "Наталія Кравчук",
    email: "natalia@example.com",
    phone: "+380501110007",
    bonusBalance: "30.00",
    createdAt: atNoon("2026-07-05"),
  },
  {
    id: "customer-oleksandr",
    name: "Олександр Лисенко",
    email: "oleksandr@example.com",
    phone: "+380501110008",
    bonusBalance: "0.00",
    createdAt: atNoon("2026-07-07"),
  },
  {
    id: "customer-yulia",
    name: "Юлія Савченко",
    email: "yulia@example.com",
    phone: "+380501110009",
    bonusBalance: "90.00",
    createdAt: atNoon("2026-07-09"),
  },
];

const productsById = Object.fromEntries(
  products.map((product) => [product.id, product]),
);

const orders = [
  // ── Existing orders ──
  {
    id: "order-hookah-set",
    customerId: "customer-olena",
    paymentMethod: "CARD",
    status: "COMPLETED",
    createdAt: atNoon("2026-07-09"),
    items: [
      { productId: "prod-v2-vaporesso-xros-3-mini", quantity: 1 },
      { productId: "prod-v2-chasha-dlia-kalianu-solaris-hlazur", quantity: 1 },
      { productId: "prod-v2-vuhillia-mind-0-5-kh", quantity: 2 },
    ],
  },
  {
    id: "order-tobacco-run",
    customerId: "customer-dmytro",
    paymentMethod: "CASH",
    status: "COMPLETED",
    createdAt: atNoon("2026-07-10"),
    items: [
      { productId: "prod-v2-tiutiun-4-20-clasic-ta-frost-line-100h", quantity: 1 },
      { productId: "prod-v2-tiutiun-mint-beztiutiunova-sumish-50-hram", quantity: 1 },
      { productId: "prod-v2-iorsh-dlia-shakhty", quantity: 1 },
    ],
  },
  {
    id: "order-vape-kit",
    customerId: "customer-artem",
    paymentMethod: "CARD",
    status: "COMPLETED",
    createdAt: atNoon("2026-07-11"),
    items: [
      { productId: "prod-v2-voopoo-doric-q", quantity: 1 },
      { productId: "prod-v2-ridyny-refrost-30ml-zamis", quantity: 2 },
    ],
  },
  {
    id: "order-mixed",
    customerId: "customer-maria",
    paymentMethod: "CARD",
    status: "PROCESSING",
    createdAt: atNoon("2026-07-12"),
    items: [
      { productId: "prod-v2-vaporesso-xros-pro", quantity: 1 },
      { productId: "prod-v2-tiutiun-space-tea-40-h", quantity: 1 },
      { productId: "prod-v2-vuhillia-mind-1sht", quantity: 1 },
      { productId: "prod-v2-kalaud", quantity: 2 },
    ],
  },
  {
    id: "order-vape-liquid",
    customerId: "customer-guest-phone",
    paymentMethod: "CASH",
    status: "NEW",
    createdAt: atNoon("2026-07-13"),
    items: [
      { productId: "prod-v2-ridyny-chaser-for-pods-30ml-zamis", quantity: 1 },
      { productId: "prod-v2-ridyny-elfliq-10ml", quantity: 1 },
      { productId: "prod-v2-shlanh-do-kaliana", quantity: 3 },
    ],
  },
  {
    id: "order-premium-hookah",
    customerId: "customer-artem",
    paymentMethod: "BONUS",
    status: "COMPLETED",
    createdAt: atNoon("2026-07-13"),
    items: [
      { productId: "prod-v2-vaporesso-xros-4-mini", quantity: 1 },
      { productId: "prod-v2-mundshtuky-dovhi", quantity: 1 },
      { productId: "prod-v2-tiutiun-pixtea-100-hram", quantity: 2 },
    ],
  },
  {
    id: "order-box-mod",
    customerId: "customer-olena",
    paymentMethod: "CARD",
    status: "NEW",
    createdAt: atNoon("2026-07-14"),
    items: [
      { productId: "prod-v2-oxva-xlim-sq-pro", quantity: 1 },
      { productId: "prod-v2-ridyny-refrost-30ml-zamis", quantity: 1 },
      { productId: "prod-v2-ridyny-chaser-for-pods-30ml-zamis", quantity: 1 },
    ],
  },

  // ── New orders ──
  {
    id: "order-nic-salts",
    customerId: "customer-ivan",
    paymentMethod: "CARD",
    status: "PROCESSING",
    createdAt: atNoon("2026-07-14"),
    items: [
      { productId: "prod-v2-ridyny-dinner-lady-fruit-full-30ml-50mg-zamis", quantity: 2 },
      { productId: "prod-v2-ridyny-fcked-lab-30-ml", quantity: 1 },
      { productId: "prod-v2-elfbar-2000-tiah", quantity: 3 },
    ],
  },
  {
    id: "order-cleaning-kit",
    customerId: "customer-natalia",
    paymentMethod: "CARD",
    status: "COMPLETED",
    createdAt: atNoon("2026-07-15"),
    items: [
      { productId: "prod-v2-kolba-kolorova", quantity: 1 },
      { productId: "prod-v2-personalnyi-mundshtuk", quantity: 2 },
      { productId: "prod-v2-pruzhyna", quantity: 1 },
    ],
  },
  {
    id: "order-disposables-bulk",
    customerId: "customer-oleksandr",
    paymentMethod: "CASH",
    status: "NEW",
    createdAt: atNoon("2026-07-15"),
    items: [
      { productId: "prod-v2-elf-bar-raya-d3-25000tiah", quantity: 5 },
      { productId: "prod-v2-elfbar-2000-tiah", quantity: 2 },
    ],
  },
  {
    id: "order-premium-tobacco",
    customerId: "customer-yulia",
    paymentMethod: "CARD",
    status: "COMPLETED",
    createdAt: atNoon("2026-07-15"),
    items: [
      { productId: "prod-v2-tiutiun-pixtea-50-hram", quantity: 1 },
      { productId: "prod-v2-tiutiun-4-20-light-100h", quantity: 1 },
      { productId: "prod-v2-tiutiun-unity-100h", quantity: 2 },
      { productId: "prod-v2-kalaud", quantity: 1 },
    ],
  },
  {
    id: "order-hoses",
    customerId: "customer-dmytro",
    paymentMethod: "CARD",
    status: "PROCESSING",
    createdAt: atNoon("2026-07-16"),
    items: [
      { productId: "prod-v2-pruzhyna", quantity: 1 },
      { productId: "prod-v2-iorsh-dlia-shakhty", quantity: 2 },
      { productId: "prod-v2-personalnyi-mundshtuk", quantity: 2 },
    ],
  },
  {
    id: "order-caliburn-kit",
    customerId: "customer-ivan",
    paymentMethod: "BONUS",
    status: "COMPLETED",
    createdAt: atNoon("2026-07-16"),
    items: [
      { productId: "prod-v2-zq-xtal-pro-kit", quantity: 1 },
      { productId: "prod-v2-ridyny-chaser-black-30ml-zamis", quantity: 2 },
      { productId: "prod-v2-ridyny-dinner-lady-30ml-50mg-zamis", quantity: 1 },
    ],
  },
  {
    id: "order-electric-coal",
    customerId: "customer-maria",
    paymentMethod: "CARD",
    status: "NEW",
    createdAt: atNoon("2026-07-17"),
    items: [
      { productId: "prod-v2-vuhillia-carbon-coco-1-kh", quantity: 1 },
      { productId: "prod-v2-pruzhyna", quantity: 1 },
      { productId: "prod-v2-tiutiun-heven-100h", quantity: 2 },
    ],
  },
  {
    id: "order-large-mixed",
    customerId: "customer-artem",
    paymentMethod: "CARD",
    status: "COMPLETED",
    createdAt: atNoon("2026-07-17"),
    items: [
      { productId: "prod-v2-vaporesso-xros-5-mini", quantity: 1 },
      { productId: "prod-v2-vaporesso-xros-mini", quantity: 1 },
      { productId: "prod-v2-plytka", quantity: 2 },
      { productId: "prod-v2-vuhillia-mind-1-kh", quantity: 1 },
      { productId: "prod-v2-ushchilniuvach-pid-chashu-ta-shakhtu", quantity: 1 },
    ],
  },
  {
    id: "order-zero-nic",
    customerId: "customer-natalia",
    paymentMethod: "CASH",
    status: "NEW",
    createdAt: atNoon("2026-07-18"),
    items: [
      { productId: "prod-v2-ridyny-alchemist-30ml-zamis", quantity: 3 },
      { productId: "prod-v2-ridyny-newway-ice-30ml-zamis", quantity: 1 },
      { productId: "prod-v2-zq-xtal-se", quantity: 1 },
    ],
  },
  {
    id: "order-alpha-premium",
    customerId: "customer-ivan",
    paymentMethod: "CARD",
    status: "COMPLETED",
    createdAt: atNoon("2026-07-18"),
    items: [
      { productId: "prod-v2-vaporesso-xros-5", quantity: 1 },
      { productId: "prod-v2-ushchilniuvach-pid-chashu-ta-shakhtu", quantity: 1 },
      { productId: "prod-v2-vuhillia-carbon-coco-1-kh", quantity: 2 },
      { productId: "prod-v2-pruzhyna", quantity: 1 },
    ],
  },
  {
    id: "order-salts-bulk",
    customerId: "customer-oleksandr",
    paymentMethod: "CARD",
    status: "PROCESSING",
    createdAt: atNoon("2026-07-18"),
    items: [
      { productId: "prod-v2-ridyny-elfliq-10ml", quantity: 2 },
      { productId: "prod-v2-ridyny-lucky-30-ml", quantity: 2 },
      { productId: "prod-v2-ridyny-flavorlab-lady-zamis", quantity: 1 },
      { productId: "prod-v2-ridyny-chaser-for-pods-10ml-zamis", quantity: 1 },
    ],
  },
  {
    id: "order-cleaning-premium",
    customerId: "customer-yulia",
    paymentMethod: "CARD",
    status: "COMPLETED",
    createdAt: atNoon("2026-07-18"),
    items: [
      { productId: "prod-v2-ushchilniuvach-pid-chashu-ta-shakhtu", quantity: 1 },
      { productId: "prod-v2-plytka", quantity: 2 },
      { productId: "prod-v2-shchyptsi-dlia-kaliana", quantity: 1 },
      { productId: "prod-v2-iorsh-dlia-shakhty", quantity: 3 },
    ],
  },
  {
    id: "order-disposables-mixed",
    customerId: "customer-natalia",
    paymentMethod: "CASH",
    status: "NEW",
    createdAt: atNoon("2026-07-18"),
    items: [
      { productId: "prod-v2-elf-bar-raya-d3-25000tiah", quantity: 2 },
      { productId: "prod-v2-elfbar-2000-tiah", quantity: 1 },
      { productId: "prod-v2-elf-bar-raya-d3-25000tiah", quantity: 3 },
      { productId: "prod-v2-elf-bar-raya-d3-25000tiah", quantity: 2 },
    ],
  },
  {
    id: "order-hoses-accessories",
    customerId: "customer-artem",
    paymentMethod: "CARD",
    status: "COMPLETED",
    createdAt: atNoon("2026-07-18"),
    items: [
      { productId: "prod-v2-kalaud", quantity: 2 },
      { productId: "prod-v2-shlanh-do-kaliana", quantity: 1 },
      { productId: "prod-v2-mundshtuky-dovhi", quantity: 2 },
      { productId: "prod-v2-chasha-dlia-kalianu-solaris-hlazur", quantity: 1 },
      { productId: "prod-v2-chasha-dlia-kalianu-solaris-hlazur", quantity: 2 },
    ],
  },
  {
    id: "order-vape-new",
    customerId: "customer-dmytro",
    paymentMethod: "CARD",
    status: "PROCESSING",
    createdAt: atNoon("2026-07-18"),
    items: [
      { productId: "prod-v2-oxva-xlim-se-2", quantity: 1 },
      { productId: "prod-v2-oxva-nexlim", quantity: 1 },
      { productId: "prod-v2-ridyny-newway-black-30ml-zamis", quantity: 2 },
      { productId: "prod-v2-ridyny-chaser-mix-30ml-zamis", quantity: 1 },
    ],
  },
  {
    id: "order-bowl-collection",
    customerId: "customer-maria",
    paymentMethod: "BONUS",
    status: "NEW",
    createdAt: atNoon("2026-07-18"),
    items: [
      { productId: "prod-v2-shchyptsi-dlia-kaliana", quantity: 1 },
      { productId: "prod-v2-shlanh-do-kaliana", quantity: 1 },
      { productId: "prod-v2-kolba-kolorova", quantity: 1 },
      { productId: "prod-v2-mundshtuky-dovhi", quantity: 2 },
      { productId: "prod-v2-personalnyi-mundshtuk", quantity: 1 },
    ],
  },
  {
    id: "order-na-grani",
    customerId: "customer-ivan",
    paymentMethod: "CARD",
    status: "PROCESSING",
    createdAt: atNoon("2026-07-18"),
    items: [
      { productId: "prod-v2-vaporesso-xros-4", quantity: 1 },
      { productId: "prod-v2-vuhillia-mind-1sht", quantity: 2 },
      { productId: "prod-v2-vuhillia-mind-0-5-kh", quantity: 1 },
      { productId: "prod-v2-tiutiun-space-tea-100-h", quantity: 2 },
    ],
  },
];

function orderTotalCents(order) {
  return order.items.reduce((total, item) => {
    const product = productsById[item.productId];
    if (!product) {
      throw new Error(`Unknown product in seed order: ${item.productId}`);
    }
    return total + product.priceCents * item.quantity;
  }, 0);
}

async function main() {
  await prisma.ageVerification.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.customer.deleteMany();
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

  for (const customer of customers) {
    await prisma.customer.create({ data: customer });
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

  const usedAmountKeys = new Set();
  for (const [orderIndex, order] of orders.entries()) {
    const totalCents = orderTotalCents(order);
    const isCardActive =
      order.paymentMethod === "CARD" &&
      (order.status === "NEW" || order.status === "PROCESSING");
    let paymentAmount = null;
    if (isCardActive) {
      for (let n = 0; n < 100; n++) {
        const candidate = money(totalCents + n);
        if (!usedAmountKeys.has(candidate)) {
          paymentAmount = candidate;
          usedAmountKeys.add(candidate);
          break;
        }
      }
    }
    await prisma.order.create({
      data: {
        id: order.id,
        customerId: order.customerId,
        paymentMethod: order.paymentMethod,
        status: order.status,
        paymentStatus:
          order.status === "CANCELLED"
            ? "FAILED"
            : order.paymentMethod === "BONUS" || order.status === "COMPLETED"
              ? "PAID"
              : "PENDING",
        paymentRef: isCardActive
          ? `ICE-${randomBytes(4).toString("hex").toUpperCase()}`
          : undefined,
        paymentAmount,
        paymentAmountKey: paymentAmount,
        nextCheckAt: isCardActive ? new Date() : undefined,
        createdAt: order.createdAt,
        totalAmount: money(totalCents),
        ageVerification: {
          create: {
            id: `age-verification-${order.id}`,
            ipAddress: `192.0.2.${orderIndex + 1}`,
            createdAt: order.createdAt,
          },
        },
        items: {
          create: order.items.map((item) => {
            const product = productsById[item.productId];

            return {
              productId: item.productId,
              quantity: item.quantity,
              price: money(product.priceCents),
            };
          }),
        },
      },
    });
  }

  console.log(
    `Seeded ${categories.length} categories, ${products.length} products, ${variantCount} variants, ${customers.length} customers (+${admins.length} admin${admins.length === 1 ? "" : "s"}: ${admins.map((entry) => entry.email).join(", ")}), ${orders.length} orders and age verifications.`,
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
