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

const categories = [
  { id: "cat-main-screen", name: "Головний екран", slug: "main-screen" },
  { id: "cat-tobacco", name: "Тютюн для кальяну", slug: "tobacco", imageUrl: "/images/products/Чайна суміш Space Tea Banana (Банан) 100 гр.webp" },
  { id: "cat-coal", name: "Вугілля", slug: "coal", imageUrl: "/images/products/Вугілля горіхове Mind Air Gap 1кг 72кубика в упаковці.webp" },
  { id: "cat-disposables", name: "Одноразові електронні сигарети", slug: "disposables", imageUrl: "/images/products/Одноразова електронна сигарета Elf Bar Raya D1 Americano Ice (Американо Лід) (13000 Затяжок).webp" },
  { id: "cat-snus", name: "Снюс", slug: "snus" },
  { id: "cat-hookah-accessories", name: "Аксесуари для кальянів", slug: "hookah-accessories", imageUrl: "/images/products/Колба під ущільнювач Candy Loop (Бордовий).webp" },
  { id: "cat-pod-systems", name: "Pod-системи", slug: "pod-systems", imageUrl: "/images/products/Vaporesso Xros 5 Grey Leather (Сірий).webp" },
  { id: "cat-cartridges-coils", name: "Картриджі та випаровувачі", slug: "cartridges-coils", imageUrl: "/images/products/Картридж Vaporesso Xros Pod 0.4 Ом (3 мл).webp" },
  { id: "cat-liquids", name: "Рідини", slug: "liquids", imageUrl: "/images/products/Рідина Elf Liq Apple Peach (Яблуко Персик) 30 мл.webp" },
];

const products = [
  {
    id: "prod-v2-nikotyn-1-ml",
    categoryId: "cat-main-screen",
    name: "Нікотин 1 мл",
    description: "Нікотин 1 мл — Головний екран.",
    priceCents: 4000,
    imageUrl: "https://placehold.co/800x800/1e3a5f/eee?text=nikotyn-1-ml",
  },
  {
    id: "prod-v2-ice-shot",
    categoryId: "cat-main-screen",
    name: "Ice Shot",
    description: "Ice Shot — Головний екран.",
    priceCents: 4000,
    imageUrl: "https://placehold.co/800x800/1e3a5f/eee?text=ice-shot",
  },
  {
    id: "prod-v2-tiutiun-space-tea-100-h",
    categoryId: "cat-tobacco",
    name: "Тютюн Space Tea 100 г.",
    description: "ok — 13 смаків з фото (100 гр)",
    priceCents: 30000,
    imageUrl: "/images/products/Чайна суміш Space Tea Banana (Банан) 100 гр.webp",
  },
  {
    id: "prod-v2-tiutiun-space-tea-40-h",
    categoryId: "cat-tobacco",
    name: "Тютюн Space Tea 40 г.",
    description: "ok — 15 смаків з фото (40 гр)",
    priceCents: 30000,
    imageUrl: "/images/products/Чайна суміш Space Tea Apple Candy (Яблуко Цукерка) 40 гр.webp",
  },
  {
    id: "prod-v2-tiutiun-mint-beztiutiunova-sumish-50-hram",
    categoryId: "cat-tobacco",
    name: "Тютюн Mint (безтютюнова суміш) 50 грам",
    description: "УВАГА: у вигрузці немає фото 50 гр — узято лінійку 200 гр (11 смаків); фото показує пачку 200 гр",
    priceCents: 30000,
    imageUrl: "/images/products/Безнікотинова суміш Mint Айс Персик 200 гр.webp",
  },
  {
    id: "prod-v2-tiutiun-heven-100h",
    categoryId: "cat-tobacco",
    name: "Тютюн Heven 100г",
    description: "УВАГА: у вигрузці немає фото 100 гр — узято лінійку 200 гр (36 смаків); фото показує пачку 200 гр",
    priceCents: 30000,
    imageUrl: "/images/products/Тютюн Heven Acai (Асаї) 200 гр.webp",
  },
  {
    id: "prod-v2-tiutiun-pixtea-100-hram",
    categoryId: "cat-tobacco",
    name: "Тютюн Pixtea 100 грам",
    description: "ok — 1 смаків з фото (100 гр)",
    priceCents: 30000,
    imageUrl: "/images/products/Чайна суміш Pixtea Blueberry Energy (Чорниця Енергетик) 100 гр.webp",
  },
  {
    id: "prod-v2-tiutiun-pixtea-50-hram",
    categoryId: "cat-tobacco",
    name: "Тютюн Pixtea 50 грам",
    description: "УВАГА: у вигрузці немає фото 50 гр — узято лінійку 250 гр (25 смаків); фото показує пачку 250 гр",
    priceCents: 30000,
    imageUrl: "/images/products/Чайна суміш Pixtea Aliens Candy (Еліенс Кенді) 250 гр.webp",
  },
  {
    id: "prod-v2-tiutiun-unity-100h",
    categoryId: "cat-tobacco",
    name: "Тютюн Unity 100г",
    description: "ok — 29 смаків з фото (100 гр)",
    priceCents: 30000,
    imageUrl: "/images/products/Тютюн Unity Limited Edition Umai (Юмай) 100 гр.webp",
  },
  {
    id: "prod-v2-tiutiun-4-20-clasic-ta-frost-line-100h",
    categoryId: "cat-tobacco",
    name: "Тютюн 4.20 Clasic та Frost Line 100г.",
    description: "ok — 41 смаків з фото (100 гр)",
    priceCents: 30000,
    imageUrl: "/images/products/Тютюн 420 Classic Frost Line Banana Strawberry (Банан Полуниця) 100 гр.webp",
  },
  {
    id: "prod-v2-tiutiun-4-20-light-100h",
    categoryId: "cat-tobacco",
    name: "Тютюн 4.20 Light 100г",
    description: "ok — 29 смаків з фото (100 гр)",
    priceCents: 30000,
    imageUrl: "/images/products/Тютюн 420 Light Line Айс Лимон Малина 100 гр.webp",
  },
  {
    id: "prod-v2-vuhillia-mind-1sht",
    categoryId: "cat-coal",
    name: "Вугілля Mind 1шт",
    description: "Вугілля Mind 1шт — Вугілля.",
    priceCents: 12000,
    imageUrl: "/images/products/Вугілля горіхове Mind Air Gap 1кг 72кубика в упаковці.webp",
  },
  {
    id: "prod-v2-vuhillia-mind-0-5-kh",
    categoryId: "cat-coal",
    name: "Вугілля Mind 0.5 кг",
    description: "Вугілля Mind 0.5 кг — Вугілля.",
    priceCents: 12000,
    imageUrl: "/images/products/Вугілля горіхове Mind Air Gap 1кг 72кубика в упаковці.webp",
  },
  {
    id: "prod-v2-vuhillia-mind-1-kh",
    categoryId: "cat-coal",
    name: "Вугілля Mind 1 кг",
    description: "Вугілля Mind 1 кг — Вугілля.",
    priceCents: 12000,
    imageUrl: "/images/products/Вугілля горіхове Mind Air Gap 1кг 72кубика в упаковці.webp",
  },
  {
    id: "prod-v2-vuhillia-carbon-coco-1-kh",
    categoryId: "cat-coal",
    name: "Вугілля Carbon Coco 1 кг",
    description: "Вугілля Carbon Coco 1 кг — Вугілля.",
    priceCents: 12000,
    imageUrl: "https://placehold.co/800x800/1e3a5f/eee?text=vuhillia-carbon-coco-1-kh",
  },
  {
    id: "prod-v2-vuhillia-carbon-coco-0-25-kh",
    categoryId: "cat-coal",
    name: "Вугілля Carbon Coco 0.25 кг",
    description: "Вугілля Carbon Coco 0.25 кг — Вугілля.",
    priceCents: 12000,
    imageUrl: "https://placehold.co/800x800/1e3a5f/eee?text=vuhillia-carbon-coco-0-25-kh",
  },
  {
    id: "prod-v2-elf-bar-raya-d3-25000tiah",
    categoryId: "cat-disposables",
    name: "Elf Bar Raya D3 25000тяг",
    description: "Elf Bar Raya D3 25000тяг — Одноразові електронні сигарети.",
    priceCents: 55000,
    imageUrl: "/images/products/Одноразова електронна сигарета Elf Bar Raya D1 Americano Ice (Американо Лід) (13000 Затяжок).webp",
  },
  {
    id: "prod-v2-elfbar-2000-tiah",
    categoryId: "cat-disposables",
    name: "Elfbar 2000 тяг.",
    description: "Elfbar 2000 тяг. — Одноразові електронні сигарети.",
    priceCents: 55000,
    imageUrl: "/images/products/Одноразова електронна сигарета Elf Bar LB Lush Ice (Лаш Лід) (5000 Затяжок).webp",
  },
  {
    id: "prod-v2-snius-cuba-black-43mg",
    categoryId: "cat-snus",
    name: "Снюс Cuba Black 43mg",
    description: "Снюс Cuba Black 43mg — Снюс.",
    priceCents: 15000,
    imageUrl: "https://placehold.co/800x800/1e3a5f/eee?text=snius-cuba-black-43mg",
  },
  {
    id: "prod-v2-ushchilniuvach-pid-chashu-ta-shakhtu",
    categoryId: "cat-hookah-accessories",
    name: "Ущільнювач під Чашу та Шахту",
    description: "Ущільнювач під Чашу та Шахту — Аксесуари для кальянів.",
    priceCents: 12000,
    imageUrl: "/images/products/Колба під ущільнювач Candy Loop (Бордовий).webp",
  },
  {
    id: "prod-v2-chasha-dlia-kalianu-solaris-hlazur",
    categoryId: "cat-hookah-accessories",
    name: "Чаша для Кальяну Solaris Глазурь",
    description: "Чаша для Кальяну Solaris Глазурь — Аксесуари для кальянів.",
    priceCents: 12000,
    imageUrl: "https://placehold.co/800x800/1e3a5f/eee?text=chasha-dlia-kalianu-solaris-hlazur",
  },
  {
    id: "prod-v2-kalaud",
    categoryId: "cat-hookah-accessories",
    name: "Калауд",
    description: "Калауд — Аксесуари для кальянів.",
    priceCents: 12000,
    imageUrl: "https://placehold.co/800x800/1e3a5f/eee?text=kalaud",
  },
  {
    id: "prod-v2-mundshtuky-dovhi",
    categoryId: "cat-hookah-accessories",
    name: "Мундштуки Довгі",
    description: "Мундштуки Довгі — Аксесуари для кальянів.",
    priceCents: 12000,
    imageUrl: "/images/products/Одноразові мундштуки довгі 50шт XB (Чорний).webp",
  },
  {
    id: "prod-v2-pruzhyna",
    categoryId: "cat-hookah-accessories",
    name: "Пружина",
    description: "Пружина — Аксесуари для кальянів.",
    priceCents: 12000,
    imageUrl: "https://placehold.co/800x800/1e3a5f/eee?text=pruzhyna",
  },
  {
    id: "prod-v2-shlanh-do-kaliana",
    categoryId: "cat-hookah-accessories",
    name: "Шланг до Кальяна",
    description: "Шланг до Кальяна — Аксесуари для кальянів.",
    priceCents: 12000,
    imageUrl: "https://placehold.co/800x800/1e3a5f/eee?text=shlanh-do-kaliana",
  },
  {
    id: "prod-v2-personalnyi-mundshtuk",
    categoryId: "cat-hookah-accessories",
    name: "Персональний мундштук",
    description: "Персональний мундштук — Аксесуари для кальянів.",
    priceCents: 12000,
    imageUrl: "/images/products/Персональний мундштук D-03 (Синій).webp",
  },
  {
    id: "prod-v2-iorsh-dlia-shakhty",
    categoryId: "cat-hookah-accessories",
    name: "Йорш для шахти",
    description: "Йорш для шахти — Аксесуари для кальянів.",
    priceCents: 12000,
    imageUrl: "https://placehold.co/800x800/1e3a5f/eee?text=iorsh-dlia-shakhty",
  },
  {
    id: "prod-v2-shchyptsi-dlia-kaliana",
    categoryId: "cat-hookah-accessories",
    name: "Щипці для Кальяна",
    description: "Щипці для Кальяна — Аксесуари для кальянів.",
    priceCents: 12000,
    imageUrl: "https://placehold.co/800x800/1e3a5f/eee?text=shchyptsi-dlia-kaliana",
  },
  {
    id: "prod-v2-plytka",
    categoryId: "cat-hookah-accessories",
    name: "Плитка",
    description: "Плитка — Аксесуари для кальянів.",
    priceCents: 12000,
    imageUrl: "https://placehold.co/800x800/1e3a5f/eee?text=plytka",
  },
  {
    id: "prod-v2-kolba-kolorova",
    categoryId: "cat-hookah-accessories",
    name: "Колба Кольорова",
    description: "Колба Кольорова — Аксесуари для кальянів.",
    priceCents: 12000,
    imageUrl: "https://placehold.co/800x800/1e3a5f/eee?text=kolba-kolorova",
  },
  {
    id: "prod-v2-vaporesso-xros-5",
    categoryId: "cat-pod-systems",
    name: "Vaporesso XROS 5",
    description: "Vaporesso XROS 5 — Pod-системи.",
    priceCents: 150000,
    imageUrl: "/images/products/Vaporesso Xros 5 Grey Leather (Сірий).webp",
  },
  {
    id: "prod-v2-vaporesso-xros-3-mini",
    categoryId: "cat-pod-systems",
    name: "Vaporesso Xros 3 Mini",
    description: "Vaporesso Xros 3 Mini — Pod-системи.",
    priceCents: 150000,
    imageUrl: "/images/products/Vaporesso Xros Mini Orange Red (Помаранчевий з червоним).webp",
  },
  {
    id: "prod-v2-vaporesso-xros-4-mini",
    categoryId: "cat-pod-systems",
    name: "Vaporesso Xros 4 Mini",
    description: "Vaporesso Xros 4 Mini — Pod-системи.",
    priceCents: 150000,
    imageUrl: "/images/products/Vaporesso Xros Mini Orange Red (Помаранчевий з червоним).webp",
  },
  {
    id: "prod-v2-vaporesso-xros-4",
    categoryId: "cat-pod-systems",
    name: "Vaporesso Xros 4",
    description: "Vaporesso Xros 4 — Pod-системи.",
    priceCents: 150000,
    imageUrl: "/images/products/Vaporesso Xros 5 Grey Leather (Сірий).webp",
  },
  {
    id: "prod-v2-vaporesso-xros-5-mini",
    categoryId: "cat-pod-systems",
    name: "Vaporesso XROS 5 mini",
    description: "Vaporesso XROS 5 mini — Pod-системи.",
    priceCents: 150000,
    imageUrl: "/images/products/Vaporesso Xros Mini Orange Red (Помаранчевий з червоним).webp",
  },
  {
    id: "prod-v2-vaporesso-xros-pro",
    categoryId: "cat-pod-systems",
    name: "Vaporesso Xros Pro",
    description: "Vaporesso Xros Pro — Pod-системи.",
    priceCents: 150000,
    imageUrl: "/images/products/Vaporesso Xros Pro Blue (Синій).webp",
  },
  {
    id: "prod-v2-vaporesso-xros-mini",
    categoryId: "cat-pod-systems",
    name: "Vaporesso Xros Mini",
    description: "Vaporesso Xros Mini — Pod-системи.",
    priceCents: 150000,
    imageUrl: "/images/products/Vaporesso Xros Mini Orange Red (Помаранчевий з червоним).webp",
  },
  {
    id: "prod-v2-oxva-xlim-sq-pro",
    categoryId: "cat-pod-systems",
    name: "Oxva Xlim SQ Pro",
    description: "Oxva Xlim SQ Pro — Pod-системи.",
    priceCents: 150000,
    imageUrl: "/images/products/Oxva Xlim SQ Pro - Green Leather.webp",
  },
  {
    id: "prod-v2-zq-xtal-pro-kit",
    categoryId: "cat-pod-systems",
    name: "ZQ Xtal Pro Kit",
    description: "ZQ Xtal Pro Kit — Pod-системи.",
    priceCents: 150000,
    imageUrl: "https://placehold.co/800x800/1e3a5f/eee?text=zq-xtal-pro-kit",
  },
  {
    id: "prod-v2-oxva-nexlim",
    categoryId: "cat-pod-systems",
    name: "Oxva NEXLIM",
    description: "Oxva NEXLIM — Pod-системи.",
    priceCents: 150000,
    imageUrl: "/images/products/OXVA NEXLIM - Pine Green.webp",
  },
  {
    id: "prod-v2-zq-xtal-se",
    categoryId: "cat-pod-systems",
    name: "ZQ Xtal Se+",
    description: "ZQ Xtal Se+ — Pod-системи.",
    priceCents: 150000,
    imageUrl: "/images/products/ZQ Xtal SE+ - Gradient Pink.webp",
  },
  {
    id: "prod-v2-oxva-xlim-se-2",
    categoryId: "cat-pod-systems",
    name: "OXVA XLIM SE 2",
    description: "OXVA XLIM SE 2 — Pod-системи.",
    priceCents: 150000,
    imageUrl: "/images/products/OXVA Origin SE - Matte Black.webp",
  },
  {
    id: "prod-v2-voopoo-doric-q",
    categoryId: "cat-pod-systems",
    name: "VOOPOO Doric Q",
    description: "VOOPOO Doric Q — Pod-системи.",
    priceCents: 150000,
    imageUrl: "/images/products/VooPoo Doric Q - Mint Green.webp",
  },
  {
    id: "prod-v2-vaporesso-xros-4-nano",
    categoryId: "cat-pod-systems",
    name: "Vaporesso Xros 4 Nano",
    description: "Vaporesso Xros 4 Nano — Pod-системи.",
    priceCents: 150000,
    imageUrl: "/images/products/Vaporesso Xros 4 Nano Word-Pop Yellow (Жовтий з блакитним).webp",
  },
  {
    id: "prod-v2-vaporesso-xros-pro-2",
    categoryId: "cat-pod-systems",
    name: "Vaporesso Xros Pro 2",
    description: "Vaporesso Xros Pro 2 — Pod-системи.",
    priceCents: 150000,
    imageUrl: "/images/products/Vaporesso Xros Pro Blue (Синій).webp",
  },
  {
    id: "prod-v2-vaporesso-xros-6",
    categoryId: "cat-pod-systems",
    name: "Vaporesso XROS 6",
    description: "Vaporesso XROS 6 — Pod-системи.",
    priceCents: 150000,
    imageUrl: "/images/products/Vaporesso Xros 5 Grey Leather (Сірий).webp",
  },
  {
    id: "prod-v2-smok-propod-gt-kit",
    categoryId: "cat-pod-systems",
    name: "Smok Propod GT Kit",
    description: "Smok Propod GT Kit — Pod-системи.",
    priceCents: 150000,
    imageUrl: "/images/products/Стартовий набір Smok Vape Pen 22 Starter Kit (Original).webp",
  },
  {
    id: "prod-v2-oxva-xlim-pro-3",
    categoryId: "cat-pod-systems",
    name: "Oxva Xlim Pro 3",
    description: "Oxva Xlim Pro 3 — Pod-системи.",
    priceCents: 150000,
    imageUrl: "/images/products/OXVA XLIM PRO 2 - Brown Python.webp",
  },
  {
    id: "prod-v2-voopoo-doric-20-se",
    categoryId: "cat-pod-systems",
    name: "Voopoo Doric 20 SE",
    description: "Voopoo Doric 20 SE — Pod-системи.",
    priceCents: 150000,
    imageUrl: "/images/products/Voopoo Doric 20 SE (Сірий).webp",
  },
  {
    id: "prod-v2-vaporesso-xros-3",
    categoryId: "cat-pod-systems",
    name: "Vaporesso Xros 3",
    description: "Vaporesso Xros 3 — Pod-системи.",
    priceCents: 150000,
    imageUrl: "/images/products/Vaporesso Xros 5 Grey Leather (Сірий).webp",
  },
  {
    id: "prod-v2-zq-xtal-mini-kit",
    categoryId: "cat-pod-systems",
    name: "ZQ Xtal Mini Kit",
    description: "ZQ Xtal Mini Kit — Pod-системи.",
    priceCents: 150000,
    imageUrl: "https://placehold.co/800x800/1e3a5f/eee?text=zq-xtal-mini-kit",
  },
  {
    id: "prod-v2-pod-elf-bar-elfx",
    categoryId: "cat-pod-systems",
    name: "Pod Elf Bar Elfx",
    description: "Pod Elf Bar Elfx — Pod-системи.",
    priceCents: 150000,
    imageUrl: "/images/products/Elf Bar ELFX Pod (Сірий).webp",
  },
  {
    id: "prod-v2-vaporesso-xros-6-mini",
    categoryId: "cat-pod-systems",
    name: "Vaporesso Xros 6 Mini",
    description: "Vaporesso Xros 6 Mini — Pod-системи.",
    priceCents: 150000,
    imageUrl: "/images/products/Vaporesso Xros Mini Orange Red (Помаранчевий з червоним).webp",
  },
  {
    id: "prod-v2-vaporesso-xros-series",
    categoryId: "cat-cartridges-coils",
    name: "Vaporesso XROS Series",
    description: "2мл/3мл, серія COREX 2.0/3.0",
    priceCents: 18000,
    imageUrl: "/images/products/Картридж Vaporesso Xros Pod 0.4 Ом (3 мл).webp",
  },
  {
    id: "prod-v2-oxva-xlim-v2",
    categoryId: "cat-cartridges-coils",
    name: "OXVA Xlim V2",
    description: "2мл, бокова заправка",
    priceCents: 18000,
    imageUrl: "/images/products/OXVA Xlim V2 - 0.8 Ом.jpg",
  },
  {
    id: "prod-v2-lost-vape-ursa-vbudovanyi-vyparnyk",
    categoryId: "cat-cartridges-coils",
    name: "Lost Vape Ursa (вбудований випарник)",
    description: "2.5мл; існує також порожній Ursa Empty під випарники UB Mini",
    priceCents: 18000,
    imageUrl: "/images/products/Змінний випаровувач Lost Vape UB Lite L3 Coil 0.8 Ом.webp",
  },
  {
    id: "prod-v2-voopoo-argus-pod",
    categoryId: "cat-cartridges-coils",
    name: "Voopoo Argus Pod",
    description: "2мл/3мл",
    priceCents: 18000,
    imageUrl: "/images/products/Картридж Voopoo Argus Pod 0.4 Ом (3 мл).webp",
  },
  {
    id: "prod-v2-voopoo-vinci-series",
    categoryId: "cat-cartridges-coils",
    name: "Voopoo Vinci Series",
    description: "MTL",
    priceCents: 18000,
    imageUrl: "/images/products/Картридж Voopoo Vinci Pod 0.8 Ом, 2.0 мл.webp",
  },
  {
    id: "prod-v2-geekvape-u",
    categoryId: "cat-cartridges-coils",
    name: "GeekVape U",
    description: "2мл",
    priceCents: 18000,
    imageUrl: "/images/products/Картридж GeekVape U 0.7 Ом.webp",
  },
  {
    id: "prod-v2-voopoo-ito",
    categoryId: "cat-cartridges-coils",
    name: "Voopoo ITO",
    description: "2мл, бокова заправка",
    priceCents: 18000,
    imageUrl: "/images/products/Випаровувач Voopoo ITO-М2 1.0 Ом.webp",
  },
  {
    id: "prod-v2-smok-lp1-dlia-novo-4-novo-4-mini",
    categoryId: "cat-cartridges-coils",
    name: "Smok LP1 (для Novo 4 / Novo 4 Mini)",
    description: "змінний випарник, картридж окремо",
    priceCents: 18000,
    imageUrl: "https://placehold.co/800x800/1e3a5f/eee?text=smok-lp1-dlia-novo-4-novo-4-mini",
  },
  {
    id: "prod-v2-smok-novo-2x",
    categoryId: "cat-cartridges-coils",
    name: "Smok Novo 2X",
    description: "2мл, вбудований випарник",
    priceCents: 18000,
    imageUrl: "/images/products/Картридж Smok Novo 2 - Mesh 0.8 Ом.webp",
  },
  {
    id: "prod-v2-elf-bar-rf350-mate500",
    categoryId: "cat-cartridges-coils",
    name: "Elf Bar RF350 / Mate500",
    description: "1.6мл",
    priceCents: 18000,
    imageUrl: "/images/products/Заправлені картриджі Elf Bar P1 2.0 Мл, 1.2 Ом - Banana Ice.webp",
  },
  {
    id: "prod-v2-freeton-f-resin-breeze-se",
    categoryId: "cat-cartridges-coils",
    name: "Freeton F-Resin Breeze SE",
    description: "2мл",
    priceCents: 18000,
    imageUrl: "https://placehold.co/800x800/1e3a5f/eee?text=freeton-f-resin-breeze-se",
  },
  {
    id: "prod-v2-smok-novo-4-mini-empty-porozhnii",
    categoryId: "cat-cartridges-coils",
    name: "Smok Novo 4 Mini Empty (порожній)",
    description: "без випарника, купується окремо",
    priceCents: 18000,
    imageUrl: "/images/products/Smok Novo 4 Mini Empty (порожній) - під випарник LP1 0.8 0.9 1.2 Ом.jpg",
  },
  {
    id: "prod-v2-zq-xtal-pro-coil",
    categoryId: "cat-cartridges-coils",
    name: "ZQ Xtal Pro Coil",
    description: "для ZQ Xtal Pro Kit / Xtal Mini",
    priceCents: 18000,
    imageUrl: "/images/products/Випаровувач ZQ XTAL Pro 0.6 Ом.webp",
  },
  {
    id: "prod-v2-oxva-nexlim-2",
    categoryId: "cat-cartridges-coils",
    name: "OXVA NeXlim",
    description: "2мл/4мл",
    priceCents: 18000,
    imageUrl: "/images/products/Картридж OXVA NeXLIM 0.6 Ом 4 мл.webp",
  },
  {
    id: "prod-v2-vaporesso-luxe-q",
    categoryId: "cat-cartridges-coils",
    name: "Vaporesso Luxe Q",
    description: "2мл/3мл",
    priceCents: 18000,
    imageUrl: "/images/products/Картридж Vaporesso LUXE Q 2 мл 0.6 Ом.webp",
  },
  {
    id: "prod-v2-smok-novo-4-empty-porozhnii",
    categoryId: "cat-cartridges-coils",
    name: "Smok Novo 4 Empty (порожній)",
    description: "без випарника, купується окремо",
    priceCents: 18000,
    imageUrl: "https://placehold.co/800x800/1e3a5f/eee?text=smok-novo-4-empty-porozhnii",
  },
  {
    id: "prod-v2-smok-novo-x",
    categoryId: "cat-cartridges-coils",
    name: "Smok Novo X",
    description: "2мл, вбудований випарник",
    priceCents: 18000,
    imageUrl: "/images/products/Картридж Smok Novo X 0.8 Ом.webp",
  },
  {
    id: "prod-v2-vaporesso-luxe-x",
    categoryId: "cat-cartridges-coils",
    name: "Vaporesso Luxe X",
    description: "5мл, mesh",
    priceCents: 18000,
    imageUrl: "/images/products/Картридж Vaporesso LUXE X 5ml - 0.8 Ом.webp",
  },
  {
    id: "prod-v2-lost-vape-ub-mini-s1",
    categoryId: "cat-cartridges-coils",
    name: "Lost Vape UB Mini S1",
    description: "для Ursa Empty / Orion Mini / Ursa Baby Pro, зустрічається й 1.0 Ом",
    priceCents: 18000,
    imageUrl: "/images/products/Випаровувач Lost Vape UB Mini S1 0.8 Ом.webp",
  },
  {
    id: "prod-v2-vaporesso-zero",
    categoryId: "cat-cartridges-coils",
    name: "Vaporesso Zero",
    description: "2мл, серія Zero/Zero 2/Zero S",
    priceCents: 18000,
    imageUrl: "/images/products/Картридж Vaporesso Vibe Smart Pod 0.7 1.0 Ом (4.5 мл).webp",
  },
  {
    id: "prod-v2-smok-nord-2-rpm-empty-porozhnii",
    categoryId: "cat-cartridges-coils",
    name: "Smok Nord 2 RPM Empty (порожній)",
    description: "без випарника",
    priceCents: 18000,
    imageUrl: "/images/products/Smok Nord 2 RPM Empty (порожній) - під випарник RPM 0.3 Ом (MTL Mesh) 0.4 Ом (Mesh) 0.8 Ом (MTL DC).jpg",
  },
  {
    id: "prod-v2-upends-upox",
    categoryId: "cat-cartridges-coils",
    name: "Upends Upox",
    description: "2мл, вбудований випарник",
    priceCents: 18000,
    imageUrl: "/images/products/Картридж Upends UpOX Cartridge 2 мл, 1.2 Ом.webp",
  },
  {
    id: "prod-v2-voopoo-pnp-tm2",
    categoryId: "cat-cartridges-coils",
    name: "Voopoo PnP-TM2",
    description: "12-18 Вт, туга затяжка",
    priceCents: 18000,
    imageUrl: "/images/products/Випаровувач Voopoo PnP TM2 Mesh Coil 0.8 Ом (Original).webp",
  },
  {
    id: "prod-v2-smok-rpm-rpm-sc",
    categoryId: "cat-cartridges-coils",
    name: "Smok RPM / RPM SC",
    description: "для Nord/Nord 2/Nord 4/Nord X/RPM40",
    priceCents: 18000,
    imageUrl: "/images/products/Випаровувач Smok RPM MTL Mesh 0.3 Ом.webp",
  },
  {
    id: "prod-v2-voopoo-tpp-dm4",
    categoryId: "cat-cartridges-coils",
    name: "Voopoo TPP-DM4",
    description: "32-40 Вт, сітка",
    priceCents: 18000,
    imageUrl: "/images/products/Випаровувач VooPoo TPP-DM4 0.3 Ом.webp",
  },
  {
    id: "prod-v2-eleaf-iore-lite",
    categoryId: "cat-cartridges-coils",
    name: "Eleaf iOre Lite",
    description: "1.6-2мл",
    priceCents: 18000,
    imageUrl: "/images/products/Картридж Eleaf IORE Lite 2 1.0 Ом.webp",
  },
  {
    id: "prod-v2-elf-bar-elfx",
    categoryId: "cat-cartridges-coils",
    name: "Elf Bar Elfx",
    description: "2мл, mesh",
    priceCents: 18000,
    imageUrl: "/images/products/Картридж Elf Bar ELFX Dual Mesh 0.6 Ом 3 мл.webp",
  },
  {
    id: "prod-v2-ridyny-elfliq-30ml",
    categoryId: "cat-liquids",
    name: "Рідини ELFLIQ 30ML",
    description: "ok — смаки підтверджені наявними фото товару",
    priceCents: 19000,
    imageUrl: "/images/products/Рідина Elf Liq Apple Peach (Яблуко Персик) 30 мл.webp",
  },
  {
    id: "prod-v2-ridyny-elfliq-10ml",
    categoryId: "cat-liquids",
    name: "Рідини ELFLIQ 10ML",
    description: "ok — смаки підтверджені наявними фото товару",
    priceCents: 12000,
    imageUrl: "/images/products/Рідина Elf Liq Apple Peach (Яблуко Персик) 10 мл.webp",
  },
  {
    id: "prod-v2-ridyny-chaser-for-pods-10ml-zamis",
    categoryId: "cat-liquids",
    name: "Рідини Chaser For Pods 10ml Заміс",
    description: "ok — смаки підтверджені наявними фото товару",
    priceCents: 12000,
    imageUrl: "/images/products/Рідина Chaser For Pods Вишня Ментол 10 мл.webp",
  },
  {
    id: "prod-v2-ridyny-chaser-for-pods-30ml-zamis",
    categoryId: "cat-liquids",
    name: "Рідини Chaser For Pods 30ml Заміс",
    description: "ok — смаки підтверджені наявними фото товару",
    priceCents: 19000,
    imageUrl: "/images/products/Рідина Chaser For Pods Вишня 30 мл.webp",
  },
  {
    id: "prod-v2-ridyny-chaser-black-30ml-zamis",
    categoryId: "cat-liquids",
    name: "Рідини Chaser Black 30ml Заміс",
    description: "ok — смаки підтверджені наявними фото товару",
    priceCents: 19000,
    imageUrl: "/images/products/Набір Chaser Black 30 мл 50 мг - Cola Pomelo.webp",
  },
  {
    id: "prod-v2-ridyny-chaser-mix-30ml-zamis",
    categoryId: "cat-liquids",
    name: "Рідини Chaser Mix 30ml Заміс",
    description: "ok — смаки підтверджені наявними фото товару",
    priceCents: 19000,
    imageUrl: "/images/products/Набір Chaser Mix 30 мл 50 мг - Orbit.webp",
  },
  {
    id: "prod-v2-ridyny-chaser-lux-30ml-zamis",
    categoryId: "cat-liquids",
    name: "Рідини Chaser Lux 30ml Заміс",
    description: "ok — смаки підтверджені наявними фото товару",
    priceCents: 19000,
    imageUrl: "/images/products/Рідина Chaser Lux Blueberry Mint (Чорниця М’ята) 30 мл.webp",
  },
  {
    id: "prod-v2-ridyny-refrost-30ml-zamis",
    categoryId: "cat-liquids",
    name: "Рідини Refrost 30ml Заміс",
    description: "ok — смаки підтверджені наявними фото товару",
    priceCents: 19000,
    imageUrl: "/images/products/Refrost Salt 30 мл 50 мг - Red Berries.webp",
  },
  {
    id: "prod-v2-ridyny-steampuff-30ml-zamis",
    categoryId: "cat-liquids",
    name: "Рідини Steampuff 30ml Заміс",
    description: "ok — смаки підтверджені наявними фото товару",
    priceCents: 19000,
    imageUrl: "/images/products/Набори для самозамісу SteamPuff 30 мл 50 мг - Apple.webp",
  },
  {
    id: "prod-v2-ridyny-newway-black-30ml-zamis",
    categoryId: "cat-liquids",
    name: "Рідини NewWay Black 30ml Заміс",
    description: "ok — смаки підтверджені наявними фото товару",
    priceCents: 19000,
    imageUrl: "/images/products/Набори для самозамісу New Way Black 30 мл 10 мг - Berries.webp",
  },
  {
    id: "prod-v2-ridyny-newway-ice-30ml-zamis",
    categoryId: "cat-liquids",
    name: "Рідини NewWay Ice 30ml Заміс",
    description: "ok — смаки підтверджені наявними фото товару",
    priceCents: 19000,
    imageUrl: "/images/products/Набори для самозамісу New Way Ice 30 мл 10 мг - Cherry Ice.webp",
  },
  {
    id: "prod-v2-ridyny-alchemist-30ml-zamis",
    categoryId: "cat-liquids",
    name: "Рідини Alchemist 30ml Заміс",
    description: "ok — смаки підтверджені наявними фото товару",
    priceCents: 19000,
    imageUrl: "/images/products/Рідина Alchemist Salt Frappuccino (Фраппучіно) 30 мл.webp",
  },
  {
    id: "prod-v2-ridyny-lucky-30-ml",
    categoryId: "cat-liquids",
    name: "Рідини Lucky 30 ml",
    description: "ok — смаки підтверджені наявними фото товару",
    priceCents: 19000,
    imageUrl: "/images/products/Lucky Salt 30 мл 50 мг - Apple.webp",
  },
  {
    id: "prod-v2-ridyny-lucky-15-ml",
    categoryId: "cat-liquids",
    name: "Рідини Lucky 15 ml",
    description: "ok — смаки підтверджені наявними фото товару",
    priceCents: 14000,
    imageUrl: "/images/products/Набір Lucky 15 мл 50 мг - Grapefruit.webp",
  },
  {
    id: "prod-v2-ridyny-lucky-chrome-30-ml",
    categoryId: "cat-liquids",
    name: "Рідини Lucky Chrome 30 ml",
    description: "знайдено 8 смаків, потрібно уточнити ще 2",
    priceCents: 19000,
    imageUrl: "/images/products/Lucky Salt 30 мл 50 мг - Peach.webp",
  },
  {
    id: "prod-v2-ridyny-dinner-lady-30ml-50mg-zamis",
    categoryId: "cat-liquids",
    name: "Рідини Dinner Lady 30ml 50mg Заміс",
    description: "ok — смаки підтверджені наявними фото товару",
    priceCents: 19000,
    imageUrl: "/images/products/Dinner Lady Salt 30 мл 50 мг - Sweet Fusion.webp",
  },
  {
    id: "prod-v2-ridyny-dinner-lady-fruit-full-30ml-50mg-zamis",
    categoryId: "cat-liquids",
    name: "Рідини Dinner Lady Fruit FULL 30ml 50mg Заміс",
    description: "ok — смаки підтверджені наявними фото товару",
    priceCents: 19000,
    imageUrl: "/images/products/Набір Dinner Lady Fruit Full 30 мл 30 50 мг - Blue Raspberry.webp",
  },
  {
    id: "prod-v2-ridyny-erra-day-30ml-zamis",
    categoryId: "cat-liquids",
    name: "Рідини Erra Day 30ml Заміс",
    description: "фото відсутні — смаки не підтверджено фотографіями, потрібне фото від постачальника",
    priceCents: 19000,
    imageUrl: "https://placehold.co/800x800/1e3a5f/eee?text=ridyny-erra-day-30ml-zamis",
    isAvailable: false,
  },
  {
    id: "prod-v2-ridyny-erra-night-30ml-zamis",
    categoryId: "cat-liquids",
    name: "Рідини Erra Night 30ml Заміс",
    description: "фото відсутні — смаки не підтверджено фотографіями, потрібне фото від постачальника",
    priceCents: 19000,
    imageUrl: "https://placehold.co/800x800/1e3a5f/eee?text=ridyny-erra-night-30ml-zamis",
    isAvailable: false,
  },
  {
    id: "prod-v2-ridyny-flavorlab-lady-zamis",
    categoryId: "cat-liquids",
    name: "Рідини Flavorlab Lady Заміс",
    description: "ok — смаки підтверджені наявними фото товару",
    priceCents: 19000,
    imageUrl: "/images/products/Набір Flavorlab Lady 30 мл 50 мг - Blue Lagoon.webp",
  },
  {
    id: "prod-v2-ridyny-sour-boom-30ml-zamis",
    categoryId: "cat-liquids",
    name: "Рідини Sour Boom 30ml Заміс",
    description: "ok, повний список містить 14+ смаків (є ще Sicilian Orange, Sour Barberis, Water Lemon, Black Energy)",
    priceCents: 19000,
    imageUrl: "/images/products/Рідини Sour Boom 30ml Заміс - Cherry Boom.jpg",
  },
  {
    id: "prod-v2-ridyny-sour-boom-15ml",
    categoryId: "cat-liquids",
    name: "Рідини Sour Boom 15ml",
    description: "знайдено 3 смаки для формату 15мл (менша «Citrus Drive» лінійка), потрібно уточнити решту",
    priceCents: 14000,
    imageUrl: "/images/products/Рідини Sour Boom 15ml - Lemon Lime.jpg",
  },
  {
    id: "prod-v2-ridyny-fcked-lab-30-ml",
    categoryId: "cat-liquids",
    name: "Рідини F*cked Lab 30 мл",
    description: "ok — смаки підтверджені наявними фото товару",
    priceCents: 19000,
    imageUrl: "/images/products/Набори для самозамісу Fucked Lab Salt 30 мл 50 мг - Lichi Peach Guava.webp",
  },
];

const productVariants = [
  {
    productId: "prod-v2-tiutiun-space-tea-100-h",
    tastes: [
      { name: "Banana", imageUrl: "/images/products/Чайна суміш Space Tea Banana (Банан) 100 гр.webp" },
      { name: "Barberry Milk Cake", imageUrl: "/images/products/Чайна суміш Space Tea Barberry Milk Cake (Барбарис Молоко Пиріг) 100 гр.webp" },
      { name: "Brain Freeze", imageUrl: "/images/products/Чайна суміш Space Tea Brain Freeze (Брейн Фріз) 100 гр.webp" },
      { name: "Cola", imageUrl: "/images/products/Чайна суміш Space Tea Cola (Кола) 100 гр.webp" },
      { name: "Lemon Pie", imageUrl: "/images/products/Чайна суміш Space Tea Lemon Pie (Лимон Пиріг) 100 гр.webp" },
      { name: "Lemongrass", imageUrl: "/images/products/Чайна суміш Space Tea Lemongrass (Лемонграс) 100 гр.webp" },
      { name: "Malibu", imageUrl: "/images/products/Чайна суміш Space Tea Malibu (Малібу) 100 гр.webp" },
      { name: "Odins Nectar", imageUrl: "/images/products/Чайна суміш Space Tea Odins Nectar (Одінс Нектар) 100 гр.webp" },
      { name: "Peach", imageUrl: "/images/products/Чайна суміш Space Tea Peach (Персик) 100 гр.webp" },
      { name: "Peach Berry Sky", imageUrl: "/images/products/Чайна суміш Space Tea Peach Berry Sky (Піч Беррі Скай) 100 гр.webp" },
      { name: "Pineapple", imageUrl: "/images/products/Чайна суміш Space Tea Pineapple (Ананас) 100 гр.webp" },
      { name: "Raspberry Cream", imageUrl: "/images/products/Чайна суміш Space Tea Raspberry Cream (Малина Крем) 100 гр.webp" },
      { name: "Sicilian Orange", imageUrl: "/images/products/Чайна суміш Space Tea Sicilian Orange (Сицилійський Апельсин) 100 гр.webp" },
    ],
    sizes: [{ size: null, priceCents: 30000 }],
  },
  {
    productId: "prod-v2-tiutiun-space-tea-40-h",
    tastes: [
      { name: "Apple Candy", imageUrl: "/images/products/Чайна суміш Space Tea Apple Candy (Яблуко Цукерка) 40 гр.webp" },
      { name: "Berry Cream", imageUrl: "/images/products/Чайна суміш Space Tea Berry Cream (Ягода Крем) 40 гр.webp" },
      { name: "Berry Dance", imageUrl: "/images/products/Чайна суміш Space Tea Berry Dance (Беррі Денс) 40 гр.webp" },
      { name: "Brain Freeze", imageUrl: "/images/products/Чайна суміш Space Tea Brain Freeze (Брейн Фріз) 40 гр.webp" },
      { name: "Citrus Delight", imageUrl: "/images/products/Чайна суміш Space Tea Citrus Delight (Цитрус Ділайт) 40 гр.webp" },
      { name: "Fruit Paradise", imageUrl: "/images/products/Чайна суміш Space Tea Fruit Paradise (Фрут Парадайз) 40 гр.webp" },
      { name: "Fruity Fusion", imageUrl: "/images/products/Чайна суміш Space Tea Fruity Fusion (Фруті Фьюжн) 40 гр.webp" },
      { name: "Green Mix", imageUrl: "/images/products/Чайна суміш Space Tea Green Mix (Грін Мікс) 40 гр.webp" },
      { name: "Lemonberry Ice-Cream", imageUrl: "/images/products/Чайна суміш Space Tea Lemonberry Ice-Cream (Лемонберрі Айс-Крем) 40 гр.webp" },
      { name: "Malibu", imageUrl: "/images/products/Чайна суміш Space Tea Malibu (Малібу) 40 гр.webp" },
      { name: "Mango", imageUrl: "/images/products/Чайна суміш Space Tea Mango (Манго) 40 гр.webp" },
      { name: "Nut Ice Cream", imageUrl: "/images/products/Чайна суміш Space Tea Nut Ice Cream (Горіх Морозиво) 40 гр.webp" },
      { name: "Peach Berry Sky", imageUrl: "/images/products/Чайна суміш Space Tea Peach Berry Sky (Піч Беррі Скай) 40 гр.webp" },
      { name: "Space Milkshake", imageUrl: "/images/products/Чайна суміш Space Tea Space Milkshake (Мілкшейк) 40 гр.webp" },
      { name: "Tropical Dreams", imageUrl: "/images/products/Чайна суміш Space Tea Tropical Dreams (Тропікал Дрімс) 40 гр.webp" },
    ],
    sizes: [{ size: null, priceCents: 30000 }],
  },
  {
    productId: "prod-v2-tiutiun-mint-beztiutiunova-sumish-50-hram",
    tastes: [
      { name: "Айс Персик", imageUrl: "/images/products/Безнікотинова суміш Mint Айс Персик 200 гр.webp" },
      { name: "Ананас Манго-Маракуя", imageUrl: "/images/products/Безнікотинова суміш Mint Ананас Манго-Маракуя 200 гр.webp" },
      { name: "Вишня-Малина", imageUrl: "/images/products/Безнікотинова суміш Mint Вишня-Малина 200 гр.webp" },
      { name: "Гранат Барбарис", imageUrl: "/images/products/Безнікотинова суміш Mint Гранат Барбарис 200 гр.webp" },
      { name: "Груша-Яблуко", imageUrl: "/images/products/Безнікотинова суміш Mint Груша-Яблуко 200 гр.webp" },
      { name: "Квітковий Мікс", imageUrl: "/images/products/Безнікотинова суміш Mint Квітковий Мікс 200 гр.webp" },
      { name: "Лимон", imageUrl: "/images/products/Безнікотинова суміш Mint Лимон 200 гр.webp" },
      { name: "Лічі-Малина", imageUrl: "/images/products/Безнікотинова суміш Mint Лічі-Малина 200 гр.webp" },
      { name: "Мохіто", imageUrl: "/images/products/Безнікотинова суміш Mint Мохіто 200 гр.webp" },
      { name: "Смородина Персик-Лайм", imageUrl: "/images/products/Безнікотинова суміш Mint Смородина Персик-Лайм 200 гр.webp" },
      { name: "Ягоди-М'ята", imageUrl: "/images/products/Безнікотинова суміш Mint Ягоди-М'ята 200 гр.webp" },
    ],
    sizes: [{ size: null, priceCents: 30000 }],
  },
  {
    productId: "prod-v2-tiutiun-heven-100h",
    tastes: [
      { name: "Acai", imageUrl: "/images/products/Тютюн Heven Acai (Асаї) 200 гр.webp" },
      { name: "Banana", imageUrl: "/images/products/Тютюн Heven Banana (Банан) 200 гр.webp" },
      { name: "Barberry", imageUrl: "/images/products/Тютюн Heven Barberry (Барбарис) 200 гр.webp" },
      { name: "Black Currant", imageUrl: "/images/products/Тютюн Heven Black Currant (Чорна Смородина) 200 гр.webp" },
      { name: "Black Grape", imageUrl: "/images/products/Тютюн Heven Black Grape (Чорний Виноград) 200 гр.webp" },
      { name: "Blend Berry", imageUrl: "/images/products/Тютюн Heven Blend Berry (Бленд Беррі) 200 гр.webp" },
      { name: "Bounty", imageUrl: "/images/products/Тютюн Heven Bounty (Баунті) 200 гр.webp" },
      { name: "Colder", imageUrl: "/images/products/Тютюн Heven Colder (Коулдер) 200 гр.webp" },
      { name: "Curacao", imageUrl: "/images/products/Тютюн Heven Curacao (Кюрасао) 200 гр.webp" },
      { name: "Dark Cherry", imageUrl: "/images/products/Тютюн Heven Dark Cherry (Дарк Черрі) 200 гр.webp" },
      { name: "Double Mix", imageUrl: "/images/products/Тютюн Heven Double Mix (Дабл Мікс) 200 гр.webp" },
      { name: "Energy", imageUrl: "/images/products/Тютюн Heven Energy (Енергетик) 200 гр.webp" },
      { name: "Espresso Shot", imageUrl: "/images/products/Тютюн Heven Espresso Shot (Еспресо Шот) 200 гр.webp" },
      { name: "Evergreen", imageUrl: "/images/products/Тютюн Heven Evergreen (Евергрін) 200 гр.webp" },
      { name: "Fruit Gum", imageUrl: "/images/products/Тютюн Heven Fruit Gum (Фрут Гам) 200 гр.webp" },
      { name: "Granate", imageUrl: "/images/products/Тютюн Heven Granate (Гренейт) 200 гр.webp" },
      { name: "Grapefruit", imageUrl: "/images/products/Тютюн Heven Grapefruit (Грейпфрут) 200 гр.webp" },
      { name: "Jelly Cola", imageUrl: "/images/products/Тютюн Heven Jelly Cola (Джеллі Кола) 200 гр.webp" },
      { name: "Juice Orange", imageUrl: "/images/products/Тютюн Heven Juice Orange (Сік Апельсин) 200 гр.webp" },
      { name: "Kiwis", imageUrl: "/images/products/Тютюн Heven Kiwis (Ківіс) 200 гр.webp" },
      { name: "Lemon", imageUrl: "/images/products/Тютюн Heven Lemon (Лимон) 200 гр.webp" },
      { name: "Mango", imageUrl: "/images/products/Тютюн Heven Mango (Манго) 200 гр.webp" },
      { name: "Maracuja", imageUrl: "/images/products/Тютюн Heven Maracuja (Маракуя) 200 гр.webp" },
      { name: "Melon", imageUrl: "/images/products/Тютюн Heven Melon (Диня) 200 гр.webp" },
      { name: "One Pear", imageUrl: "/images/products/Тютюн Heven One Pear (Ван Пір) 200 гр.webp" },
      { name: "Pine Shock", imageUrl: "/images/products/Тютюн Heven Pine Shock (Пайн Шок) 200 гр.webp" },
      { name: "Rasberry", imageUrl: "/images/products/Тютюн Heven Rasberry (Малина) 200 гр.webp" },
      { name: "Red Cot", imageUrl: "/images/products/Тютюн Heven Red Cot (Ред Кот) 200 гр.webp" },
      { name: "Sour Citrus", imageUrl: "/images/products/Тютюн Heven Sour Citrus (Сауер Цитрус) 200 гр.webp" },
      { name: "Strawberries", imageUrl: "/images/products/Тютюн Heven Strawberries (Строуберріс) 200 гр.webp" },
      { name: "Tropical", imageUrl: "/images/products/Тютюн Heven Tropical (Тропікал) 200 гр.webp" },
      { name: "Twin Berry", imageUrl: "/images/products/Тютюн Heven Twin Berry (Твін Беррі) 200 гр.webp" },
      { name: "Watermelon", imageUrl: "/images/products/Тютюн Heven Watermelon (Кавун) 200 гр.webp" },
      { name: "x Enigma Daiquiri Night", imageUrl: "/images/products/Тютюн Heven x Enigma Daiquiri Night (Дайкірі Найт) 200 гр.webp" },
      { name: "x Genri.candyter Сhef Cake", imageUrl: "/images/products/Тютюн Heven x Genri.candyter Сhef Cake (Шеф Кейк) 200 гр.webp" },
      { name: "x Gresco Flame", imageUrl: "/images/products/Тютюн Heven x Gresco Flame (Флейм) 200 гр.webp" },
    ],
    sizes: [{ size: null, priceCents: 30000 }],
  },
  {
    productId: "prod-v2-tiutiun-pixtea-100-hram",
    tastes: [
      { name: "Blueberry Energy", imageUrl: "/images/products/Чайна суміш Pixtea Blueberry Energy (Чорниця Енергетик) 100 гр.webp" },
    ],
    sizes: [{ size: null, priceCents: 30000 }],
  },
  {
    productId: "prod-v2-tiutiun-pixtea-50-hram",
    tastes: [
      { name: "Aliens Candy", imageUrl: "/images/products/Чайна суміш Pixtea Aliens Candy (Еліенс Кенді) 250 гр.webp" },
      { name: "Atacama Mix", imageUrl: "/images/products/Чайна суміш Pixtea Atacama Mix (Атакама Мікс) 250 гр.webp" },
      { name: "Berry Crunch", imageUrl: "/images/products/Чайна суміш Pixtea Berry Crunch (Беррі Кранч) 250 гр.webp" },
      { name: "Berry Rush", imageUrl: "/images/products/Чайна суміш Pixtea Berry Rush (Беррі Раш) 250 гр.webp" },
      { name: "Cherry Bomb", imageUrl: "/images/products/Чайна суміш Pixtea Cherry Bomb (Черрі Бомб) 250 гр.webp" },
      { name: "Citrus Busters", imageUrl: "/images/products/Чайна суміш Pixtea Citrus Busters (Цитрус Бастерс) 250 гр.webp" },
      { name: "Coconut Kiss", imageUrl: "/images/products/Чайна суміш Pixtea Coconut Kiss (Коконат Кісс) 250 гр.webp" },
      { name: "Currant Brutality", imageUrl: "/images/products/Чайна суміш Pixtea Currant Brutality (Карент Бруталіті) 250 гр.webp" },
      { name: "Daring Pineapple", imageUrl: "/images/products/Чайна суміш Pixtea Daring Pineapple (Дерінг Пайнепл) 250 гр.webp" },
      { name: "Explosive Fatality", imageUrl: "/images/products/Чайна суміш Pixtea Explosive Fatality (Експлосів Фаталіті) 250 гр.webp" },
      { name: "Frosty Watermelon", imageUrl: "/images/products/Чайна суміш Pixtea Frosty Watermelon (Фрості Вотермелон) 250 гр.webp" },
      { name: "Grape vs Melon", imageUrl: "/images/products/Чайна суміш Pixtea Grape vs Melon (Виноград vs Диня) 250 гр.webp" },
      { name: "Jasmine Pie", imageUrl: "/images/products/Чайна суміш Pixtea Jasmine Pie (Жасмин Пиріг) 250 гр.webp" },
      { name: "Lullaby Berries", imageUrl: "/images/products/Чайна суміш Pixtea Lullaby Berries (Луллабі Берріс) 250 гр.webp" },
      { name: "Marvelous Berries", imageUrl: "/images/products/Чайна суміш Pixtea Marvelous Berries (Марвелес Берріс) 250 гр.webp" },
      { name: "Orange Party", imageUrl: "/images/products/Чайна суміш Pixtea Orange Party (Оранж Паті) 250 гр.webp" },
      { name: "Raspberry Shot", imageUrl: "/images/products/Чайна суміш Pixtea Raspberry Shot (Распберрі Шот) 250 гр.webp" },
      { name: "Sour Strike", imageUrl: "/images/products/Чайна суміш Pixtea Sour Strike (Сауер Страйк) 250 гр.webp" },
      { name: "Sunny Drive", imageUrl: "/images/products/Чайна суміш Pixtea Sunny Drive (Санні Драйв) 250 гр.webp" },
      { name: "Sweet Burst", imageUrl: "/images/products/Чайна суміш Pixtea Sweet Burst (Світ Бьорст) 250 гр.webp" },
      { name: "Tea Time", imageUrl: "/images/products/Чайна суміш Pixtea Tea Time (Ті Тайм) 250 гр.webp" },
      { name: "Tropical Splash", imageUrl: "/images/products/Чайна суміш Pixtea Tropical Splash (Тропікал Сплеш) 250 гр.webp" },
      { name: "Vanilla Fizz", imageUrl: "/images/products/Чайна суміш Pixtea Vanilla Fizz (Ванілла Фізз) 250 гр.webp" },
      { name: "Vivid Fusion", imageUrl: "/images/products/Чайна суміш Pixtea Vivid Fusion (Вівід Фьюжн) 250 гр.webp" },
      { name: "x Odin Valhalla Berries", imageUrl: "/images/products/Чайна суміш Pixtea x Odin Valhalla Berries (Вальгалла Берріс) 250 гр.webp" },
    ],
    sizes: [{ size: null, priceCents: 30000 }],
  },
  {
    productId: "prod-v2-tiutiun-unity-100h",
    tastes: [
      { name: "Umai", imageUrl: "/images/products/Тютюн Unity Limited Edition Umai (Юмай) 100 гр.webp" },
      { name: "Acid Berry", imageUrl: "/images/products/Тютюн Unity Urban Collection Acid Berry (Ейсід Беррі) 100 гр.webp" },
      { name: "Berry Jelly", imageUrl: "/images/products/Тютюн Unity Urban Collection Berry Jelly (Ягода Желе) 100 гр.webp" },
      { name: "Berry Lavender", imageUrl: "/images/products/Тютюн Unity Urban Collection Berry Lavender (Ягода Лаванда) 100 гр.webp" },
      { name: "Berry Mochi", imageUrl: "/images/products/Тютюн Unity Urban Collection Berry Mochi (Ягоди Моті) 100 гр.webp" },
      { name: "Brazilian Tea", imageUrl: "/images/products/Тютюн Unity Urban Collection Brazilian Tea (Бразіліан Ті) 100 гр.webp" },
      { name: "Brownie", imageUrl: "/images/products/Тютюн Unity Urban Collection Brownie (Брауні) 100 гр.webp" },
      { name: "Cherry Shot", imageUrl: "/images/products/Тютюн Unity Urban Collection Cherry Shot (Вишня Шот) 100 гр.webp" },
      { name: "Christmas Fizz", imageUrl: "/images/products/Тютюн Unity Urban Collection Christmas Fizz (Крісмас Фізз) 100 гр.webp" },
      { name: "Citrus Spritz", imageUrl: "/images/products/Тютюн Unity Urban Collection Citrus Spritz (Цитрус Шпріц) 100 гр.webp" },
      { name: "Cola", imageUrl: "/images/products/Тютюн Unity Urban Collection Cola (Кола) 100 гр.webp" },
      { name: "Dragon Passion", imageUrl: "/images/products/Тютюн Unity Urban Collection Dragon Passion (Драгон Маракуйя) 100 гр.webp" },
      { name: "Dream Catcher", imageUrl: "/images/products/Тютюн Unity Urban Collection Dream Catcher (Дрім Кече) 100 гр.webp" },
      { name: "English Tea", imageUrl: "/images/products/Тютюн Unity Urban Collection English Tea (Інгліш Ті) 100 гр.webp" },
      { name: "Fruittella", imageUrl: "/images/products/Тютюн Unity Urban Collection Fruittella (Фруттелла) 100 гр.webp" },
      { name: "Godzilla", imageUrl: "/images/products/Тютюн Unity Urban Collection Godzilla (Ґодзілла) 100 гр.webp" },
      { name: "Grape Jelly", imageUrl: "/images/products/Тютюн Unity Urban Collection Grape Jelly (Виноград Желе) 100 гр.webp" },
      { name: "Gravefruit", imageUrl: "/images/products/Тютюн Unity Urban Collection Gravefruit (Грейвфрут) 100 гр.webp" },
      { name: "Guarana Berry", imageUrl: "/images/products/Тютюн Unity Urban Collection Guarana Berry (Гуарана Ягода) 100 гр.webp" },
      { name: "Mango Kiss", imageUrl: "/images/products/Тютюн Unity Urban Collection Mango Kiss (Манго Кісс) 100 гр.webp" },
      { name: "Orange Blossom", imageUrl: "/images/products/Тютюн Unity Urban Collection Orange Blossom (Оранж Блоссом) 100 гр.webp" },
      { name: "Pineapple Candy", imageUrl: "/images/products/Тютюн Unity Urban Collection Pineapple Candy (Ананас Цукерка) 100 гр.webp" },
      { name: "Salvia", imageUrl: "/images/products/Тютюн Unity Urban Collection Salvia (Шавлія) 100 гр.webp" },
      { name: "Turbo", imageUrl: "/images/products/Тютюн Unity Urban Collection Turbo (Турбо) 100 гр.webp" },
      { name: "Wild Berries", imageUrl: "/images/products/Тютюн Unity Urban Collection Wild Berries (Суниця) 100 гр.webp" },
      { name: "Pear Tea", imageUrl: "/images/products/Тютюн Unity x Aladin Pear Tea (Груша Чай) 100 гр.webp" },
      { name: "Pineapple Grapefruit Lemon", imageUrl: "/images/products/Тютюн Unity x Aladin Pineapple Grapefruit Lemon (Ананас Грейпфрут Лимон) 100 гр.webp" },
      { name: "Champagne Papi", imageUrl: "/images/products/Тютюн Unity x Lebiga Champagne Papi (Шампань Папі) 100 гр.webp" },
      { name: "Cristmas Vibe", imageUrl: "/images/products/Тютюн Unity x Lebiga Cristmas Vibe (Крістмас Вайб) 100 гр.webp" },
    ],
    sizes: [{ size: null, priceCents: 30000 }],
  },
  {
    productId: "prod-v2-tiutiun-4-20-clasic-ta-frost-line-100h",
    tastes: [
      { name: "Banana Strawberry", imageUrl: "/images/products/Тютюн 420 Classic Frost Line Banana Strawberry (Банан Полуниця) 100 гр.webp" },
      { name: "Cherry Lemonade", imageUrl: "/images/products/Тютюн 420 Classic Frost Line Cherry Lemonade (Вишня Лимонад) 100 гр.webp" },
      { name: "Freeze Pop", imageUrl: "/images/products/Тютюн 420 Classic Frost Line Freeze Pop (Фріз Поп) 100 гр.webp" },
      { name: "Grapefruit Melons", imageUrl: "/images/products/Тютюн 420 Classic Frost Line Grapefruit Melons (Грейпфрут Мелонс) 100 гр.webp" },
      { name: "Love Is", imageUrl: "/images/products/Тютюн 420 Classic Frost Line Love Is (Лав Із) 100 гр.webp" },
      { name: "Malibu Vibe", imageUrl: "/images/products/Тютюн 420 Classic Frost Line Malibu Vibe (Малібу Вайб) 100 гр.webp" },
      { name: "Pear Soda", imageUrl: "/images/products/Тютюн 420 Classic Frost Line Pear Soda (Груша Сода) 100 гр.webp" },
      { name: "Pink Berries", imageUrl: "/images/products/Тютюн 420 Classic Frost Line Pink Berries (Пінк Берріс) 100 гр.webp" },
      { name: "Thailand Shot", imageUrl: "/images/products/Тютюн 420 Classic Frost Line Thailand Shot (Таїланд Шот) 100 гр.webp" },
      { name: "Toxic Cactus", imageUrl: "/images/products/Тютюн 420 Classic Frost Line Toxic Cactus (Токсік Кактус) 100 гр.webp" },
      { name: "Waterberry Shot", imageUrl: "/images/products/Тютюн 420 Classic Frost Line Waterberry Shot (Вотерберрі Шот) 100 гр.webp" },
      { name: "Apple Squirt", imageUrl: "/images/products/Тютюн 420 Classic Line Apple Squirt (Епл Сквьорт) 100 гр.webp" },
      { name: "Barberry Candy", imageUrl: "/images/products/Тютюн 420 Classic Line Barberry Candy (Барбарис Цукерка) 100 гр.webp" },
      { name: "Blackberry", imageUrl: "/images/products/Тютюн 420 Classic Line Blackberry (Ожина) 100 гр.webp" },
      { name: "Blueberry Melon", imageUrl: "/images/products/Тютюн 420 Classic Line Blueberry Melon (Чорниця Диня) 100 гр.webp" },
      { name: "Captain Baldezh", imageUrl: "/images/products/Тютюн 420 Classic Line Captain Baldezh (Капітан Балдьож) 100 гр.webp" },
      { name: "Christmas", imageUrl: "/images/products/Тютюн 420 Classic Line Christmas (Крістмас) 100 гр.webp" },
      { name: "Citrus Mint", imageUrl: "/images/products/Тютюн 420 Classic Line Citrus Mint (Цитрус М'ята) 100 гр.webp" },
      { name: "Cranberry Juice", imageUrl: "/images/products/Тютюн 420 Classic Line Cranberry Juice (Журавлина Сік) 100 гр.webp" },
      { name: "Cream Liquor", imageUrl: "/images/products/Тютюн 420 Classic Line Cream Liquor (Крем Лікер) 100 гр.webp" },
      { name: "Grape Soda", imageUrl: "/images/products/Тютюн 420 Classic Line Grape Soda (Виноград Сода) 100 гр.webp" },
      { name: "Ice Grape Berry", imageUrl: "/images/products/Тютюн 420 Classic Line Ice Grape Berry (Лід Виноград Ягода) 100 гр.webp" },
      { name: "Jungle Fruit", imageUrl: "/images/products/Тютюн 420 Classic Line Jungle Fruit (Джангл Фрут) 100 гр.webp" },
      { name: "Kiwi Smoothie", imageUrl: "/images/products/Тютюн 420 Classic Line Kiwi Smoothie (Ківі Смузі) 100 гр.webp" },
      { name: "Lemon Cake", imageUrl: "/images/products/Тютюн 420 Classic Line Lemon Cake (Лимон Пиріг) 100 гр.webp" },
      { name: "Lemon Squirt", imageUrl: "/images/products/Тютюн 420 Classic Line Lemon Squirt (Лемон Сквьорт) 100 гр.webp" },
      { name: "Lime", imageUrl: "/images/products/Тютюн 420 Classic Line Lime (Лайм) 100 гр.webp" },
      { name: "Malvina", imageUrl: "/images/products/Тютюн 420 Classic Line Malvina (Малина) 100 гр.webp" },
      { name: "Neas Peach", imageUrl: "/images/products/Тютюн 420 Classic Line Neas Peach (Персик) 100 гр.webp" },
      { name: "Oblepiha", imageUrl: "/images/products/Тютюн 420 Classic Line Oblepiha (Обліпиха) 100 гр.webp" },
      { name: "Pistacchio Cream", imageUrl: "/images/products/Тютюн 420 Classic Line Pistacchio Cream (Пісташіо Крем) 100 гр.webp" },
      { name: "Pomegranate Mors", imageUrl: "/images/products/Тютюн 420 Classic Line Pomegranate Mors (Гранат Морс) 100 гр.webp" },
      { name: "Red Currant", imageUrl: "/images/products/Тютюн 420 Classic Line Red Currant (Червона Смородина) 100 гр.webp" },
      { name: "Scotch Whisky", imageUrl: "/images/products/Тютюн 420 Classic Line Scotch Whisky (Скотч Віскі) 100 гр.webp" },
      { name: "Toxic Candy", imageUrl: "/images/products/Тютюн 420 Classic Line Toxic Candy (Токсік Кенді) 100 гр.webp" },
      { name: "Turbo", imageUrl: "/images/products/Тютюн 420 Classic Line Turbo (Турбо) 100 гр.webp" },
      { name: "Tutti Frutti", imageUrl: "/images/products/Тютюн 420 Classic Line Tutti Frutti (Тутті Фрутті) 100 гр.webp" },
      { name: "Waffle", imageUrl: "/images/products/Тютюн 420 Classic Line Waffle (Вафлі) 100 гр.webp" },
      { name: "Watermelon Juice", imageUrl: "/images/products/Тютюн 420 Classic Line Watermelon Juice (Кавун Сік) 100 гр.webp" },
      { name: "Wildberry", imageUrl: "/images/products/Тютюн 420 Classic Line Wildberry (Вайлдберрі) 100 гр.webp" },
      { name: "x Fedyapro Peach Gelatto", imageUrl: "/images/products/Тютюн 420 Classic Line x Fedyapro Peach Gelatto (Піч Джелатто) 100 гр.webp" },
    ],
    sizes: [{ size: null, priceCents: 30000 }],
  },
  {
    productId: "prod-v2-tiutiun-4-20-light-100h",
    tastes: [
      { name: "Айс Лимон Малина", imageUrl: "/images/products/Тютюн 420 Light Line Айс Лимон Малина 100 гр.webp" },
      { name: "Айс Яблуко", imageUrl: "/images/products/Тютюн 420 Light Line Айс Яблуко 100 гр.webp" },
      { name: "Ананасовий Смузі", imageUrl: "/images/products/Тютюн 420 Light Line Ананасовий Смузі 100 гр.webp" },
      { name: "Бананово Горіховий Десерт", imageUrl: "/images/products/Тютюн 420 Light Line Бананово Горіховий Десерт 100 гр.webp" },
      { name: "Ванільна Кола", imageUrl: "/images/products/Тютюн 420 Light Line Ванільна Кола 100 гр.webp" },
      { name: "Грін Мікс", imageUrl: "/images/products/Тютюн 420 Light Line Грін Мікс 100 гр.webp" },
      { name: "Кавун Лимон", imageUrl: "/images/products/Тютюн 420 Light Line Кавун Лимон 100 гр.webp" },
      { name: "Кавуново-Динний Сорбет", imageUrl: "/images/products/Тютюн 420 Light Line Кавуново-Динний Сорбет 100 гр.webp" },
      { name: "Крюшон", imageUrl: "/images/products/Тютюн 420 Light Line Крюшон 100 гр.webp" },
      { name: "Лайм Персик", imageUrl: "/images/products/Тютюн 420 Light Line Лайм Персик 100 гр.webp" },
      { name: "Леді Кіллер", imageUrl: "/images/products/Тютюн 420 Light Line Леді Кіллер 100 гр.webp" },
      { name: "Лимонно Медовий Холлс", imageUrl: "/images/products/Тютюн 420 Light Line Лимонно Медовий Холлс 100 гр.webp" },
      { name: "Літній Вайб", imageUrl: "/images/products/Тютюн 420 Light Line Літній Вайб 100 гр.webp" },
      { name: "Манго Персик Диня", imageUrl: "/images/products/Тютюн 420 Light Line Манго Персик Диня 100 гр.webp" },
      { name: "Маршмелоу Полуничний", imageUrl: "/images/products/Тютюн 420 Light Line Маршмелоу Полуничний 100 гр.webp" },
      { name: "Морозиво", imageUrl: "/images/products/Тютюн 420 Light Line Морозиво 100 гр.webp" },
      { name: "Огірковий Лимонад", imageUrl: "/images/products/Тютюн 420 Light Line Огірковий Лимонад 100 гр.webp" },
      { name: "Ожиновий Мармелад", imageUrl: "/images/products/Тютюн 420 Light Line Ожиновий Мармелад 100 гр.webp" },
      { name: "Полуниця Базилік", imageUrl: "/images/products/Тютюн 420 Light Line Полуниця Базилік 100 гр.webp" },
      { name: "Рафаелло", imageUrl: "/images/products/Тютюн 420 Light Line Рафаелло 100 гр.webp" },
      { name: "Рожевий Лимонад", imageUrl: "/images/products/Тютюн 420 Light Line Рожевий Лимонад 100 гр.webp" },
      { name: "Свіжі Ягоди", imageUrl: "/images/products/Тютюн 420 Light Line Свіжі Ягоди 100 гр.webp" },
      { name: "Сливовий Чай", imageUrl: "/images/products/Тютюн 420 Light Line Сливовий Чай 100 гр.webp" },
      { name: "Сінабон", imageUrl: "/images/products/Тютюн 420 Light Line Сінабон 100 гр.webp" },
      { name: "Цитрусовий Лимонад", imageUrl: "/images/products/Тютюн 420 Light Line Цитрусовий Лимонад 100 гр.webp" },
      { name: "Цитрусовий Пунш", imageUrl: "/images/products/Тютюн 420 Light Line Цитрусовий Пунш 100 гр.webp" },
      { name: "Чорничний Мафін", imageUrl: "/images/products/Тютюн 420 Light Line Чорничний Мафін 100 гр.webp" },
      { name: "Ягоди з Мелісою", imageUrl: "/images/products/Тютюн 420 Light Line Ягоди з Мелісою 100 гр.webp" },
      { name: "Ягідна Жуйка", imageUrl: "/images/products/Тютюн 420 Light Line Ягідна Жуйка 100 гр.webp" },
    ],
    sizes: [{ size: null, priceCents: 30000 }],
  },
  {
    productId: "prod-v2-vaporesso-xros-series",
    tastes: [
      { name: "0.4 Ом", imageUrl: "/images/products/Картридж Vaporesso Xros Pod 0.4 Ом (3 мл).webp" },
      { name: "0.6 Ом", imageUrl: "/images/products/Картридж Vaporesso Xros Pod 0.6 Ом.webp" },
      { name: "0.7 Ом", imageUrl: "/images/products/Картридж Vaporesso XROS 0.7 Ом 3 мл.webp" },
      { name: "0.8 Ом", imageUrl: "/images/products/Картридж Vaporesso Xros Pod 0.8 Ом (3 мл).webp" },
      { name: "1.0 Ом", imageUrl: "/images/products/Картридж Vaporesso Xros Pod 1.0 Ом (2 мл).webp" },
      { name: "1.2 Ом", imageUrl: "/images/products/Картридж Vaporesso Xros Pod 1.2 Ом.webp", isAvailable: false },
    ],
    sizes: [{ size: null, priceCents: 18000 }],
  },
  {
    productId: "prod-v2-oxva-xlim-v2",
    tastes: [
      { name: "0.6 Ом", imageUrl: "/images/products/OXVA Xlim V2 - 0.8 Ом.jpg" },
      { name: "0.8 Ом", imageUrl: "/images/products/OXVA Xlim V2 - 0.8 Ом.jpg" },
      { name: "1.2 Ом", imageUrl: "/images/products/OXVA Xlim V2 - 0.8 Ом.jpg" },
    ],
    sizes: [{ size: null, priceCents: 18000 }],
  },
  {
    productId: "prod-v2-lost-vape-ursa-vbudovanyi-vyparnyk",
    tastes: [
      "0.6 Ом",
      { name: "0.8 Ом", imageUrl: "/images/products/Змінний випаровувач Lost Vape UB Lite L3 Coil 0.8 Ом.webp" },
      { name: "1.2 Ом", imageUrl: "/images/products/Випаровувач Lost Vape UB Lite L8 1.2 Ом.webp" },
    ],
    sizes: [{ size: null, priceCents: 18000 }],
  },
  {
    productId: "prod-v2-voopoo-argus-pod",
    tastes: [
      { name: "0.4 Ом", imageUrl: "/images/products/Картридж Voopoo Argus Pod 0.4 Ом (3 мл).webp" },
      { name: "0.7 Ом", imageUrl: "/images/products/Картридж Voopoo Argus 0.7 Ом 2 мл.webp" },
      { name: "1.0 Ом", imageUrl: "/images/products/Картридж Voopoo Argus Pod 1.0 Ом (2 мл).webp" },
      { name: "1.2 Ом", imageUrl: "/images/products/Картридж Voopoo Argus 1.2 Ом 2 мл.webp" },
    ],
    sizes: [{ size: null, priceCents: 18000 }],
  },
  {
    productId: "prod-v2-voopoo-vinci-series",
    tastes: [
      { name: "0.6 Ом", imageUrl: "/images/products/Voopoo Vinci Series - 0.6 Ом.jpg" },
      { name: "0.8 Ом", imageUrl: "/images/products/Картридж Voopoo Vinci Pod 0.8 Ом, 2.0 мл.webp" },
      "1.0 Ом",
    ],
    sizes: [{ size: null, priceCents: 18000 }],
  },
  {
    productId: "prod-v2-geekvape-u",
    tastes: [
      { name: "0.7 Ом", imageUrl: "/images/products/Картридж GeekVape U 0.7 Ом.webp" },
      { name: "1.1 Ом", imageUrl: "/images/products/Картридж GeekVape U 1.1 Ом.webp" },
      "1.7 Ом",
    ],
    sizes: [{ size: null, priceCents: 18000 }],
  },
  {
    productId: "prod-v2-voopoo-ito",
    tastes: [
      { name: "1.0 Ом", imageUrl: "/images/products/Випаровувач Voopoo ITO-М2 1.0 Ом.webp" },
      { name: "1.2 Ом", imageUrl: "/images/products/Картридж Voopoo ITO 1.2 Ом.webp" },
    ],
    sizes: [{ size: null, priceCents: 18000 }],
  },
  {
    productId: "prod-v2-smok-lp1-dlia-novo-4-novo-4-mini",
    tastes: [
      "0.8 Ом (Mesh)",
      "0.8 Ом (DC)",
      "0.9 Ом (Meshed MTL)",
      "0.9 Ом (Turbo Meshed MTL)",
      "1.2 Ом (Mesh)",
    ],
    sizes: [{ size: null, priceCents: 18000 }],
  },
  {
    productId: "prod-v2-smok-novo-2x",
    tastes: [
      { name: "0.8 Ом", imageUrl: "/images/products/Картридж Smok Novo 2 - Mesh 0.8 Ом.webp" },
      { name: "0.9 Ом", imageUrl: "/images/products/Випаровувач Smok Novo 4 LP1 Meshed 0.9 Ом MTL.webp" },
    ],
    sizes: [{ size: null, priceCents: 18000 }],
  },
  {
    productId: "prod-v2-elf-bar-rf350-mate500",
    tastes: [
      { name: "1.2 Ом", imageUrl: "/images/products/Заправлені картриджі Elf Bar P1 2.0 Мл, 1.2 Ом - Banana Ice.webp" },
    ],
    sizes: [{ size: null, priceCents: 18000 }],
  },
  {
    productId: "prod-v2-freeton-f-resin-breeze-se",
    tastes: [
      "1.2 Ом",
    ],
    sizes: [{ size: null, priceCents: 18000 }],
  },
  {
    productId: "prod-v2-smok-novo-4-mini-empty-porozhnii",
    tastes: [
      { name: "під випарник LP1: 0.8 / 0.9 / 1.2 Ом", imageUrl: "/images/products/Smok Novo 4 Mini Empty (порожній) - під випарник LP1 0.8 0.9 1.2 Ом.jpg" },
    ],
    sizes: [{ size: null, priceCents: 18000 }],
  },
  {
    productId: "prod-v2-zq-xtal-pro-coil",
    tastes: [
      { name: "0.6 Ом", imageUrl: "/images/products/Випаровувач ZQ XTAL Pro 0.6 Ом.webp" },
      { name: "1.0 Ом", imageUrl: "/images/products/Випаровувач ZQ XTAL Pro 1.0 Ом.webp" },
    ],
    sizes: [{ size: null, priceCents: 18000 }],
  },
  {
    productId: "prod-v2-oxva-nexlim-2",
    tastes: [
      { name: "0.6 Ом", imageUrl: "/images/products/Картридж OXVA NeXLIM 0.6 Ом 4 мл.webp" },
      { name: "0.8 Ом", imageUrl: "/images/products/Картридж OXVA NeXLIM 0.8 Ом 2 мл.webp" },
      { name: "1.2 Ом", imageUrl: "/images/products/Картридж OXVA NeXLIM 1.2 Ом 2 мл.webp" },
    ],
    sizes: [{ size: null, priceCents: 18000 }],
  },
  {
    productId: "prod-v2-vaporesso-luxe-q",
    tastes: [
      { name: "0.6 Ом", imageUrl: "/images/products/Картридж Vaporesso LUXE Q 2 мл 0.6 Ом.webp" },
      { name: "0.8 Ом", imageUrl: "/images/products/Картридж Vaporesso LUXE Q - Mesh 3 мл, 0.8 Ом.webp" },
      { name: "1.0 Ом", imageUrl: "/images/products/Картридж Vaporesso LUXE Q 2 мл 1.0 Ом.webp" },
      { name: "1.2 Ом", imageUrl: "/images/products/Картридж Vaporesso LUXE Q 2 мл 1.2 Ом.webp" },
    ],
    sizes: [{ size: null, priceCents: 18000 }],
  },
  {
    productId: "prod-v2-smok-novo-4-empty-porozhnii",
    tastes: [
      "під випарник LP1: 0.8 / 0.9 / 1.2 Ом",
    ],
    sizes: [{ size: null, priceCents: 18000 }],
  },
  {
    productId: "prod-v2-smok-novo-x",
    tastes: [
      { name: "0.8 Ом", imageUrl: "/images/products/Картридж Smok Novo X 0.8 Ом.webp" },
    ],
    sizes: [{ size: null, priceCents: 18000 }],
  },
  {
    productId: "prod-v2-vaporesso-luxe-x",
    tastes: [
      { name: "0.8 Ом", imageUrl: "/images/products/Картридж Vaporesso LUXE X 5ml - 0.8 Ом.webp" },
    ],
    sizes: [{ size: null, priceCents: 18000 }],
  },
  {
    productId: "prod-v2-lost-vape-ub-mini-s1",
    tastes: [
      { name: "0.8 Ом", imageUrl: "/images/products/Випаровувач Lost Vape UB Mini S1 0.8 Ом.webp" },
    ],
    sizes: [{ size: null, priceCents: 18000 }],
  },
  {
    productId: "prod-v2-vaporesso-zero",
    tastes: [
      { name: "1.0 Ом", imageUrl: "/images/products/Картридж Vaporesso Vibe Smart Pod 0.7 1.0 Ом (4.5 мл).webp" },
      { name: "1.2 Ом", imageUrl: "/images/products/Картридж Vaporesso OSMALL 1.2 Ом 2 мл.webp" },
      "1.3 Ом (CCELL)",
    ],
    sizes: [{ size: null, priceCents: 18000 }],
  },
  {
    productId: "prod-v2-smok-nord-2-rpm-empty-porozhnii",
    tastes: [
      { name: "під випарник RPM: 0.3 Ом (MTL Mesh) / 0.4 Ом (Mesh) / 0.8 Ом (MTL DC)", imageUrl: "/images/products/Smok Nord 2 RPM Empty (порожній) - під випарник RPM 0.3 Ом (MTL Mesh) 0.4 Ом (Mesh) 0.8 Ом (MTL DC).jpg" },
    ],
    sizes: [{ size: null, priceCents: 18000 }],
  },
  {
    productId: "prod-v2-upends-upox",
    tastes: [
      { name: "1.2 Ом", imageUrl: "/images/products/Картридж Upends UpOX Cartridge 2 мл, 1.2 Ом.webp" },
    ],
    sizes: [{ size: null, priceCents: 18000 }],
  },
  {
    productId: "prod-v2-voopoo-pnp-tm2",
    tastes: [
      { name: "0.8 Ом", imageUrl: "/images/products/Випаровувач Voopoo PnP TM2 Mesh Coil 0.8 Ом (Original).webp" },
    ],
    sizes: [{ size: null, priceCents: 18000 }],
  },
  {
    productId: "prod-v2-smok-rpm-rpm-sc",
    tastes: [
      { name: "0.3 Ом (MTL Mesh)", imageUrl: "/images/products/Випаровувач Smok RPM MTL Mesh 0.3 Ом.webp" },
      { name: "0.4 Ом (Mesh)", imageUrl: "/images/products/Випаровувач Smok RPM Mesh 0.4ohm.webp" },
      { name: "0.8 Ом (MTL DC)", imageUrl: "/images/products/Випаровувач Smok RPM Coil DC 0.8 Ом MTL.webp" },
    ],
    sizes: [{ size: null, priceCents: 18000 }],
  },
  {
    productId: "prod-v2-voopoo-tpp-dm4",
    tastes: [
      { name: "0.3 Ом", imageUrl: "/images/products/Випаровувач VooPoo TPP-DM4 0.3 Ом.webp" },
    ],
    sizes: [{ size: null, priceCents: 18000 }],
  },
  {
    productId: "prod-v2-eleaf-iore-lite",
    tastes: [
      { name: "1.0 Ом", imageUrl: "/images/products/Картридж Eleaf IORE Lite 2 1.0 Ом.webp" },
      { name: "1.2 Ом", imageUrl: "/images/products/Картридж Eleaf IORE Lite 1.2 Ом.webp" },
    ],
    sizes: [{ size: null, priceCents: 18000 }],
  },
  {
    productId: "prod-v2-elf-bar-elfx",
    tastes: [
      { name: "0.6 Ом", imageUrl: "/images/products/Картридж Elf Bar ELFX Dual Mesh 0.6 Ом 3 мл.webp" },
      { name: "0.8 Ом", imageUrl: "/images/products/Картридж Elf Bar ELFX Pod 0.8 Ом.webp" },
    ],
    sizes: [{ size: null, priceCents: 18000 }],
  },
  {
    productId: "prod-v2-ridyny-elfliq-30ml",
    tastes: [
      { name: "Apple Peach", imageUrl: "/images/products/Рідина Elf Liq Apple Peach (Яблуко Персик) 30 мл.webp" },
      { name: "Blue Razz Ice", imageUrl: "/images/products/Рідина Elf Liq Blue Razz Ice (Блу Разз Айс) 30 мл.webp" },
      { name: "Blueberry Rose Mint", imageUrl: "/images/products/Рідина Elf Liq Blueberry Rose Mint (Чорниця Троянда М'ята) 30 мл.webp" },
      { name: "Cherry Cola", imageUrl: "/images/products/Рідина Elf Liq Cherry Cola (Вишня Кола) 30 мл.webp" },
      { name: "Grape", imageUrl: "/images/products/Рідина Elf Liq Grape (Виноград) 30 мл.webp", isAvailable: false },
      { name: "Mango Peach", imageUrl: "/images/products/Рідина Elf Liq Mango Peach (Манго Персик) 30 мл.webp" },
      { name: "Pina Colada", imageUrl: "/images/products/Рідина Elf Liq Pina Colada (Піна Колада) 30 мл.webp" },
      { name: "Spearmint", imageUrl: "/images/products/Рідина Elf Liq Spearmint (Спірмінт) 30 мл.webp" },
    ],
    sizes: [{ size: null, priceCents: 19000 }],
  },
  {
    productId: "prod-v2-ridyny-elfliq-10ml",
    tastes: [
      { name: "Apple Peach", imageUrl: "/images/products/Рідина Elf Liq Apple Peach (Яблуко Персик) 10 мл.webp" },
      { name: "Blueberry", imageUrl: "/images/products/Рідина Elf Liq Blueberry (Чорниця) 10 мл.webp" },
      { name: "Mango Peach", imageUrl: "/images/products/Рідина Elf Liq Mango Peach (Манго Персик) 10 мл.webp" },
      { name: "Pina Colada", imageUrl: "/images/products/Рідина Elf Liq Pina Colada (Піна Колада) 10 мл.webp" },
      { name: "Pineapple Ice", imageUrl: "/images/products/Рідина Elf Liq Pineapple Ice (Ананас Лід) 10 мл.webp" },
      { name: "Pink Grapefruit", imageUrl: "/images/products/Рідина Elf Liq Pink Grapefruit (Пінк Грейпфрут) 10 мл.webp" },
      { name: "Spearmint", imageUrl: "/images/products/Рідина Elf Liq Spearmint (Спірмінт) 10 мл.webp" },
      { name: "Watermelon Cherry", imageUrl: "/images/products/Рідина Elf Liq Watermelon Cherry (Кавун Вишня) 10 мл.webp" },
    ],
    sizes: [{ size: null, priceCents: 12000 }],
  },
  {
    productId: "prod-v2-ridyny-chaser-for-pods-10ml-zamis",
    tastes: [
      { name: "Ягоди (лісові)", imageUrl: "/images/products/Рідина Chaser For Pods Ягоди 10 мл.webp" },
      { name: "Гранат", imageUrl: "/images/products/Рідина Chaser For Pods Гранат 10 мл.webp" },
      "Кактус",
      { name: "Грейпфрут", imageUrl: "/images/products/Рідини Chaser For Pods 10ml Заміс - Грейпфрут.jpg" },
      "Жовтий Драгонфрут",
      { name: "Жовта Черешня", imageUrl: "/images/products/Рідини Chaser For Pods 10ml Заміс - Жовта Черешня.jpg" },
      { name: "Яблуко", imageUrl: "/images/products/Рідина Chaser For Pods Яблуко 10 мл.webp" },
      { name: "Кавун", imageUrl: "/images/products/Рідина Chaser For Pods Кавун 10 мл.webp" },
      { name: "Вишня", imageUrl: "/images/products/Рідина Chaser For Pods Вишня Ментол 10 мл.webp" },
      { name: "Манго", imageUrl: "/images/products/Рідина Chaser For Pods Манго 10 мл.webp" },
    ],
    sizes: [{ size: null, priceCents: 12000 }],
  },
  {
    productId: "prod-v2-ridyny-chaser-for-pods-30ml-zamis",
    tastes: [
      { name: "Ягоди (лісові)", imageUrl: "/images/products/Рідина Chaser For Pods Ягоди 30 мл.webp" },
      { name: "Гранат", imageUrl: "/images/products/Рідина Chaser For Pods Гранат 30 мл.webp" },
      { name: "Кактус", imageUrl: "/images/products/Рідини Chaser For Pods 30ml Заміс - Кактус.jpg" },
      { name: "Грейпфрут", imageUrl: "/images/products/Рідини Chaser For Pods 30ml Заміс - Грейпфрут.jpg" },
      { name: "Жовтий Драгонфрут", imageUrl: "/images/products/Рідини Chaser For Pods 30ml Заміс - Жовтий Драгонфрут.jpg" },
      { name: "Жовта Черешня", imageUrl: "/images/products/Рідини Chaser For Pods 30ml Заміс - Жовта Черешня.jpg" },
      { name: "Яблуко", imageUrl: "/images/products/Рідина Chaser For Pods Яблуко 30 мл.webp" },
      { name: "Кавун", imageUrl: "/images/products/Рідина Chaser For Pods Кавун Ментол 30 мл.webp" },
      { name: "Вишня", imageUrl: "/images/products/Рідина Chaser For Pods Вишня 30 мл.webp" },
      { name: "Манго", imageUrl: "/images/products/Рідини Chaser For Pods 30ml Заміс - Манго.jpg" },
    ],
    sizes: [{ size: null, priceCents: 19000 }],
  },
  {
    productId: "prod-v2-ridyny-chaser-black-30ml-zamis",
    tastes: [
      { name: "Cola Pomelo", imageUrl: "/images/products/Набір Chaser Black 30 мл 50 мг - Cola Pomelo.webp" },
      { name: "Multifruit", imageUrl: "/images/products/Набір Chaser Black 30 мл 50 мг - Multifruit.webp" },
      { name: "Forest Mix", imageUrl: "/images/products/Набір Chaser Black 30 мл 65 мг - Forest Mix.webp" },
      { name: "Bali Triple Shot", imageUrl: "/images/products/Рідина Chaser Black Bali Triple Shot (Балі Тріпл Шот) 30 мл.webp" },
      { name: "Blackberry Sour Raspberry", imageUrl: "/images/products/Рідина Chaser Black Blackberry Sour Raspberry (Ожина Сауер Малина) 30 мл.webp" },
      { name: "Bubblegum", imageUrl: "/images/products/Рідина Chaser Black Bubblegum (Баблгам) 30 мл.webp" },
      { name: "Energy Grape", imageUrl: "/images/products/Рідина Chaser Black Energy Grape (Енергетик Виноград) 30 мл.webp" },
      { name: "Lemon Mint", imageUrl: "/images/products/Рідина Chaser Black Lemon Mint (Лимон М’ята) 30 мл.webp" },
      { name: "Pink Lemonade", imageUrl: "/images/products/Рідина Chaser Black Pink Lemonade (Пінк Лимонад) 30 мл.webp" },
      { name: "Strawberry Blueberry", imageUrl: "/images/products/Рідина Chaser Black Strawberry Blueberry (Полуниця Чорниця) 30 мл.webp" },
    ],
    sizes: [{ size: null, priceCents: 19000 }],
  },
  {
    productId: "prod-v2-ridyny-chaser-mix-30ml-zamis",
    tastes: [
      { name: "Полуниця Квас", imageUrl: "/images/products/Набір Chaser Mix 30 мл 50 мг - Полуниця Квас.webp" },
      { name: "Ром Кола", imageUrl: "/images/products/Набір Chaser Mix 30 мл 65 мг - Ром Кола.webp" },
      { name: "Базилік М'ята", imageUrl: "/images/products/Рідини Chaser Mix 30ml Заміс - Базилік М'ята.jpg" },
      { name: "Блакитна Малина Лимонад", imageUrl: "/images/products/Набір Chaser Mix 30 мл 50 мг - Малина Ревінь.webp" },
      { name: "Вишня Кокос", imageUrl: "/images/products/Набір Chaser Mix 30 мл 65 мг - Вишня Кавун.webp" },
      "Гуава Персик",
      { name: "Кавун Яблуко", imageUrl: "/images/products/Набір Chaser Mix 30 мл 65 мг - Вишня Кавун.webp" },
      { name: "Манго Грейпфрут", imageUrl: "/images/products/Рідини Chaser Mix 30ml Заміс - Манго Грейпфрут.jpg" },
      { name: "Orbit", imageUrl: "/images/products/Набір Chaser Mix 30 мл 50 мг - Orbit.webp" },
    ],
    sizes: [{ size: null, priceCents: 19000 }],
  },
  {
    productId: "prod-v2-ridyny-chaser-lux-30ml-zamis",
    tastes: [
      { name: "Blueberry Mint", imageUrl: "/images/products/Рідина Chaser Lux Blueberry Mint (Чорниця М’ята) 30 мл.webp" },
      { name: "Cherry Lemon", imageUrl: "/images/products/Рідина Chaser Lux Cherry Lemon (Вишня Лимон) 30 мл.webp" },
      { name: "Coconut Melon", imageUrl: "/images/products/Рідина Chaser Lux Coconut Melon (Кокос Диня) 30 мл.webp" },
      { name: "Kiwi Passion Fruit Guava", imageUrl: "/images/products/Рідина Chaser Lux Kiwi Passion Fruit Guava (Ківі Маракуя Гуава) 30 мл.webp" },
      { name: "Limited Edition Sangria", imageUrl: "/images/products/Рідина Chaser Lux Limited Edition Sangria (Сангрія) 30 мл.webp" },
      { name: "Sour Apple", imageUrl: "/images/products/Рідина Chaser Lux Sour Apple (Сауер Яблуко) 30 мл.webp" },
      { name: "Tea Peach", imageUrl: "/images/products/Рідина Chaser Lux Tea Peach (Чай Персик) 30 мл.webp" },
      { name: "Tropic Punch", imageUrl: "/images/products/Рідина Chaser Lux Tropic Punch (Тропік Пунш) 30 мл.webp" },
      { name: "Turbo Mint", imageUrl: "/images/products/Рідина Chaser Lux Turbo Mint (Турбо М’ята) 30 мл.webp" },
    ],
    sizes: [{ size: null, priceCents: 19000 }],
  },
  {
    productId: "prod-v2-ridyny-refrost-30ml-zamis",
    tastes: [
      { name: "Red Berries", imageUrl: "/images/products/Refrost Salt 30 мл 50 мг - Red Berries.webp" },
      { name: "Apricot Compot", imageUrl: "/images/products/Набір ReFrost 30 мл 50 мг - Apricot Compot.webp" },
      { name: "Bergamot Tea", imageUrl: "/images/products/Набір ReFrost 30 мл 50 мг - Bergamot Tea.webp" },
      { name: "Forest Candy", imageUrl: "/images/products/Набір ReFrost 30 мл 50 мг - Forest Candy.webp" },
      { name: "Grape", imageUrl: "/images/products/Набір ReFrost 30 мл 50 мг - Grape.webp" },
      { name: "Guava-Pitaya", imageUrl: "/images/products/Набір ReFrost 30 мл 50 мг - Guava-Pitaya.webp" },
      { name: "Lemon Pie", imageUrl: "/images/products/Набір ReFrost 30 мл 50 мг - Lemon Pie.webp" },
      { name: "Papaya Watermelon", imageUrl: "/images/products/Набір ReFrost 30 мл 50 мг - Papaya Watermelon.webp" },
      { name: "Sweet Mint", imageUrl: "/images/products/Набір ReFrost 30 мл 50 мг - Sweet Mint.webp" },
      { name: "White Tea", imageUrl: "/images/products/Набір ReFrost 30 мл 50 мг - White Tea.webp" },
    ],
    sizes: [{ size: null, priceCents: 19000 }],
  },
  {
    productId: "prod-v2-ridyny-steampuff-30ml-zamis",
    tastes: [
      { name: "Apple", imageUrl: "/images/products/Набори для самозамісу SteamPuff 30 мл 50 мг - Apple.webp" },
      { name: "Banana Strawberry", imageUrl: "/images/products/Набори для самозамісу SteamPuff 30 мл 50 мг - Banana Strawberry.webp" },
      { name: "Chewing Gum", imageUrl: "/images/products/Набори для самозамісу SteamPuff 30 мл 50 мг - Chewing Gum.webp" },
      { name: "Cucumber-strawberry", imageUrl: "/images/products/Набори для самозамісу SteamPuff 30 мл 50 мг - Cucumber-strawberry.webp" },
      { name: "Guava Melon", imageUrl: "/images/products/Набори для самозамісу SteamPuff 30 мл 50 мг - Guava Melon.webp" },
      { name: "Pistachio Ice Cream", imageUrl: "/images/products/Набори для самозамісу SteamPuff 30 мл 50 мг - Pistachio Ice Cream.webp" },
      { name: "Sakura Blossom", imageUrl: "/images/products/Набори для самозамісу SteamPuff 30 мл 50 мг - Sakura Blossom.webp" },
      { name: "Sweet Citrus", imageUrl: "/images/products/Набори для самозамісу SteamPuff 30 мл 50 мг - Sweet Citrus.webp" },
      { name: "Wildberry", imageUrl: "/images/products/Набори для самозамісу SteamPuff 30 мл 50 мг - Wildberry.webp" },
    ],
    sizes: [{ size: null, priceCents: 19000 }],
  },
  {
    productId: "prod-v2-ridyny-newway-black-30ml-zamis",
    tastes: [
      { name: "Berries", imageUrl: "/images/products/Набори для самозамісу New Way Black 30 мл 10 мг - Berries.webp" },
      { name: "Lemon Peach", imageUrl: "/images/products/Набори для самозамісу New Way Black 30 мл 10 мг - Lemon Peach.webp" },
      { name: "Raspberry Currant", imageUrl: "/images/products/Набори для самозамісу New Way Black 30 мл 10 мг - Raspberry Currant.webp" },
      { name: "Apple Lime", imageUrl: "/images/products/Набори для самозамісу New Way Black 30 мл 30 мг - Apple Lime.webp" },
      { name: "Cherry Strawberry", imageUrl: "/images/products/Набори для самозамісу New Way Black 30 мл 30 мг - Cherry Strawberry.webp" },
      { name: "Watermelon Melon", imageUrl: "/images/products/Набори для самозамісу New Way Black 30 мл 30 мг - Watermelon Melon.webp" },
      { name: "Exotic", imageUrl: "/images/products/Набори для самозамісу New Way Black 30 мл 50 мг - Exotic.webp" },
      { name: "Banana Melon", imageUrl: "/images/products/Набори для самозамісу New Way Black 30 мл 65 мг - Banana Melon.webp" },
      { name: "Mango Orange", imageUrl: "/images/products/Набори для самозамісу New Way Black 30 мл 65 мг - Mango Orange.webp" },
    ],
    sizes: [{ size: null, priceCents: 19000 }],
  },
  {
    productId: "prod-v2-ridyny-newway-ice-30ml-zamis",
    tastes: [
      { name: "Cherry Ice", imageUrl: "/images/products/Набори для самозамісу New Way Ice 30 мл 10 мг - Cherry Ice.webp" },
    ],
    sizes: [{ size: null, priceCents: 19000 }],
  },
  {
    productId: "prod-v2-ridyny-alchemist-30ml-zamis",
    tastes: [
      { name: "Vanilla Tobacco", imageUrl: "/images/products/Рідина Alchemist Salt Vanilla Tobacco (Ваніль Тютюн) 30 мл.webp" },
      { name: "Frappuccino", imageUrl: "/images/products/Рідина Alchemist Salt Frappuccino (Фраппучіно) 30 мл.webp" },
      { name: "Cubanana (банан-тютюн)", imageUrl: "/images/products/Рідина Alchemist Salt Vanilla Tobacco (Ваніль Тютюн) 30 мл.webp" },
      { name: "Rich Apple", imageUrl: "/images/products/Рідина Alchemist Salt Rich Apple (Річ Епл) 30 мл.webp" },
      { name: "Rasp Basil", imageUrl: "/images/products/Рідина Alchemist Salt Rasp Basil (Расп Бейзл) 30 мл.webp" },
      { name: "Pitaya Peach", imageUrl: "/images/products/Рідина Alchemist Salt Pitaya Peach (Пітая Персик) 30 мл.webp" },
      { name: "Marshmallow", imageUrl: "/images/products/Рідини Alchemist 30ml Заміс - Marshmallow.jpg" },
      { name: "Iceberg Mango", imageUrl: "/images/products/Рідина Alchemist Salt Iceberg Mango (Айсберг Манго) 30 мл.webp" },
      { name: "CranApple", imageUrl: "/images/products/Рідина Alchemist Salt Rich Apple (Річ Епл) 30 мл.webp" },
      { name: "Grapefruit", imageUrl: "/images/products/Рідина Alchemist Salt Grapefruit (Грейпфрут) 30 мл.webp" },
    ],
    sizes: [{ size: null, priceCents: 19000 }],
  },
  {
    productId: "prod-v2-ridyny-lucky-30-ml",
    tastes: [
      { name: "Apple", imageUrl: "/images/products/Lucky Salt 30 мл 50 мг - Apple.webp" },
      { name: "Blueberry", imageUrl: "/images/products/Lucky Salt 30 мл 50 мг - Blueberry.webp" },
      { name: "Peach", imageUrl: "/images/products/Lucky Salt 30 мл 50 мг - Peach.webp" },
      { name: "Mojito Aloe Cucumber Lemonade", imageUrl: "/images/products/Набір Lucky 30 мл 65 мг - Mojito Aloe Cucumber Lemonade.png" },
    ],
    sizes: [{ size: null, priceCents: 19000 }],
  },
  {
    productId: "prod-v2-ridyny-lucky-15-ml",
    tastes: [
      { name: "Grapefruit", imageUrl: "/images/products/Набір Lucky 15 мл 50 мг - Grapefruit.webp" },
      { name: "Mojito Aloe Cucumber Lemonade", imageUrl: "/images/products/Набір Lucky 15 мл 50 мг - Mojito Aloe Cucumber Lemonade.webp" },
      { name: "Blue Razz", imageUrl: "/images/products/Набір Lucky 15 мл 65 мг - Blue Razz.webp" },
    ],
    sizes: [{ size: null, priceCents: 14000 }],
  },
  {
    productId: "prod-v2-ridyny-lucky-chrome-30-ml",
    tastes: [
      "Pomegranate Cherry",
      { name: "Peach Gooseberry", imageUrl: "/images/products/Lucky Salt 30 мл 50 мг - Peach.webp" },
      { name: "Gummy Bears", imageUrl: "/images/products/Рідини Lucky Chrome 30 ml - Gummy Bears.jpg" },
      "Green Tea",
      { name: "Green Apple Lychee", imageUrl: "/images/products/Lucky Salt 30 мл 50 мг - Apple.webp" },
      { name: "Forest Berry Mint", imageUrl: "/images/products/Lucky Salt 30 мл 50 мг - Blueberry.webp" },
      "Tropical",
      "Summer Tea",
    ],
    sizes: [{ size: null, priceCents: 19000 }],
  },
  {
    productId: "prod-v2-ridyny-dinner-lady-30ml-50mg-zamis",
    tastes: [
      { name: "Sweet Fusion", imageUrl: "/images/products/Dinner Lady Salt 30 мл 50 мг - Sweet Fusion.webp" },
      { name: "Bubblegum", imageUrl: "/images/products/Набір Dinner Lady - Bubblegum 30 мл 30 50 мг.webp" },
      { name: "Smooth Tobacco", imageUrl: "/images/products/Набір Dinner Lady - Smooth Tobacco 30 мл 30 50 мг.webp" },
      { name: "Vanilla Tobacco", imageUrl: "/images/products/Набір Dinner Lady - Vanilla Tobacco 30 мл 30 50 мг.webp" },
      { name: "Tropical Fruits", imageUrl: "/images/products/Набір Mad Dinner - Tropical Fruits 30 мл 50 мг.webp" },
    ],
    sizes: [{ size: null, priceCents: 19000 }],
  },
  {
    productId: "prod-v2-ridyny-dinner-lady-fruit-full-30ml-50mg-zamis",
    tastes: [
      { name: "Blue Raspberry (sour)", imageUrl: "/images/products/Набір Dinner Lady Fruit Full 30 мл 30 50 мг - Blue Raspberry.webp" },
      { name: "Blueberry Lemonade", imageUrl: "/images/products/Набір Dinner Lady Fruit Full 30 мл 30 50 мг - Blue Raspberry.webp" },
      { name: "Bubble Gum", imageUrl: "/images/products/Рідини Dinner Lady Fruit FULL 30ml 50mg Заміс - Bubble Gum.jpg" },
      { name: "Fresh Mint", imageUrl: "/images/products/Набір Dinner Lady Fruit Full 30 мл 30 50 мг - Fresh Mint.webp" },
      { name: "Grape Kiwi Passionfruit", imageUrl: "/images/products/Набір Dinner Lady Fruit Full 30 мл 30 50 мг - Kiwi Passion Guava.webp" },
      { name: "Lime", imageUrl: "/images/products/Набір Dinner Lady Fruit Full 30 мл 30 50 мг - Lemon Lime.webp" },
      { name: "Lemon Tart", imageUrl: "/images/products/Набір Dinner Lady Fruit Full 30 мл 30 50 мг - Lemon Lime.webp" },
      { name: "Orange Black Currant", imageUrl: "/images/products/Набір Dinner Lady Fruit Full 30 мл 30 50 мг - Orange Pineapple.webp" },
      { name: "Pink Lemonade", imageUrl: "/images/products/Набір Dinner Lady Fruit Full 30 мл 30 50 мг - Lemon Lime.webp" },
      { name: "Strawberry Watermelon", imageUrl: "/images/products/Набір Dinner Lady Fruit Full 30 мл 30 50 мг - Strawberry Watermelon.webp" },
    ],
    sizes: [{ size: null, priceCents: 19000 }],
  },
  {
    productId: "prod-v2-ridyny-flavorlab-lady-zamis",
    tastes: [
      { name: "Blue Lagoon", imageUrl: "/images/products/Набір Flavorlab Lady 30 мл 50 мг - Blue Lagoon.webp" },
      { name: "Frappuccino", imageUrl: "/images/products/Рідини Flavorlab Lady Заміс - Frappuccino.jpg" },
      { name: "Pitaya Cherry", imageUrl: "/images/products/Набір Flavorlab Lady Strong 30 мл 50 мг - Pitaya Сherry.webp" },
      { name: "Beer Lemon", imageUrl: "/images/products/Набір Flavorlab Lady Strong 30 мл 50 мг - Beer Lemon.webp" },
      { name: "Cranberry Apple", imageUrl: "/images/products/Набір Flavorlab Lady Strong 30 мл 50 мг - Cranberry Apple.webp" },
      { name: "Blue Morocco", imageUrl: "/images/products/Набір Flavorlab Lady 30 мл 50 мг - Blue Morocao.webp" },
      { name: "Beer Mango", imageUrl: "/images/products/Набір Flavorlab Lady Strong 30 мл 50 мг - Beer Mango.webp" },
      { name: "Vodka Lime", imageUrl: "/images/products/Набір Flavorlab Lady 30 мл 50 мг - Vodka Lime.webp" },
    ],
    sizes: [{ size: null, priceCents: 19000 }],
  },
  {
    productId: "prod-v2-ridyny-sour-boom-30ml-zamis",
    tastes: [
      { name: "Cherry Boom", imageUrl: "/images/products/Рідини Sour Boom 30ml Заміс - Cherry Boom.jpg" },
      { name: "Cosmopolitan", imageUrl: "/images/products/Рідини Sour Boom 30ml Заміс - Cosmopolitan.jpg" },
      { name: "Fresh Melon", imageUrl: "/images/products/Рідини Sour Boom 30ml Заміс - Fresh Melon.jpg" },
      { name: "Lemon Lime", imageUrl: "/images/products/Рідини Sour Boom 30ml Заміс - Lemon Lime.jpg" },
      { name: "Mojito", imageUrl: "/images/products/Рідини Sour Boom 30ml Заміс - Mojito.jpg" },
      { name: "Pineapple Peach", imageUrl: "/images/products/Рідини Sour Boom 30ml Заміс - Pineapple Peach.jpg" },
      { name: "Pinkman", imageUrl: "/images/products/Рідини Sour Boom 30ml Заміс - Pinkman.jpg" },
      { name: "Pomegranate Lime", imageUrl: "/images/products/Рідини Sour Boom 30ml Заміс - Pomegranate Lime.jpg" },
      "Red Kiss",
      "Secret",
    ],
    sizes: [{ size: null, priceCents: 19000 }],
  },
  {
    productId: "prod-v2-ridyny-sour-boom-15ml",
    tastes: [
      { name: "Lemon Lime", imageUrl: "/images/products/Рідини Sour Boom 15ml - Lemon Lime.jpg" },
      "Sicilian Orange",
      { name: "Mojito", imageUrl: "/images/products/Рідини Sour Boom 15ml - Mojito.jpg" },
    ],
    sizes: [{ size: null, priceCents: 14000 }],
  },
  {
    productId: "prod-v2-ridyny-fcked-lab-30-ml",
    tastes: [
      { name: "Lichi Peach Guava", imageUrl: "/images/products/Набори для самозамісу Fucked Lab Salt 30 мл 50 мг - Lichi Peach Guava.webp" },
    ],
    sizes: [{ size: null, priceCents: 19000 }],
  },
];


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
