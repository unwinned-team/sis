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
  { id: "cat-hookahs", name: "Кальяни", slug: "hookahs" },
  { id: "cat-tobacco", name: "Тютюн для кальяну", slug: "tobacco" },
  { id: "cat-bowls", name: "Чаші", slug: "bowls" },
  { id: "cat-coals", name: "Вугілля", slug: "coals" },
  { id: "cat-vapes", name: "Pod-системи", slug: "vapes" },
  { id: "cat-liquids", name: "Рідини для Pod-систем", slug: "liquids" },
  { id: "cat-accessories", name: "Аксесуари", slug: "accessories" },
  { id: "cat-hoses", name: "Шланги та мундштуки", slug: "hoses" },
  { id: "cat-nic-salts", name: "Нікотинові солі", slug: "nic-salts" },
  { id: "cat-disposables", name: "Одноразові сигарети", slug: "disposables" },
  { id: "cat-cleaning", name: "Догляд та обслуговування", slug: "cleaning" },
];

const products = [
  // ── Hookahs (10) ──
  {
    id: "prod-kaljan-amstaff",
    categoryId: "cat-hookahs",
    name: "Kaljan Amstaff 580 Pro",
    description:
      "Кальян середнього розміру з алюмінієвим шахтом, компактний та легкий.",
    priceCents: 349000,
    imageUrl: "/products/hookahs/amstaff.jpg",
    isArchived: true,
  },
  {
    id: "prod-kaljan-oduman",
    categoryId: "cat-hookahs",
    name: "Oduman Ignis",
    description: "Кальян з нержавіючої сталі, сучасний дизайн, легке чищення.",
    priceCents: 529000,
    imageUrl: "/products/hookahs/oduman.jpg",
  },
  {
    id: "prod-kaljan-amy",
    categoryId: "cat-hookahs",
    name: "Amy Deluxe SS-04",
    description: "Німецька якість, сталевий кальян з мінімалістичним дизайном.",
    priceCents: 799000,
    imageUrl: "/products/hookahs/amy.jpg",
  },
  {
    id: "prod-kaljan-travel",
    categoryId: "cat-hookahs",
    name: "Кальян міні (для подорожей)",
    description: "Компактний складний кальян, ідеальний для поїздок.",
    priceCents: 189000,
    imageUrl: "/products/hookahs/travel.jpg",
    // Нет в наличии — чтобы «Немає в наявності» и 409 на заказ было видно сразу
    // после сида, без ручного переключения в админке.
    isAvailable: false,
  },
  {
    id: "prod-kaljan-storm",
    categoryId: "cat-hookahs",
    name: "Storm Mini",
    description: "Мінімалістичний настільний кальян, висота 35 см.",
    priceCents: 225000,
    imageUrl: "/products/hookahs/storm.jpg",
  },
  {
    id: "prod-kaljan-union",
    categoryId: "cat-hookahs",
    name: "Union Sleek",
    description: "Преміальний кальян з матовим покриттям та широкою шахтою.",
    priceCents: 649000,
    imageUrl: "/products/hookahs/union.jpg",
  },
  {
    id: "prod-kaljan-alpha",
    categoryId: "cat-hookahs",
    name: "Alpha Hookah X",
    description: "Німецький кальян з преміальної сталі, ідеальна тяга, висота 65 см.",
    priceCents: 899000,
    imageUrl: "/products/hookahs/alpha.jpg",
  },
  {
    id: "prod-kaljan-dschinni",
    categoryId: "cat-hookahs",
    name: "Dschinni Skyline",
    description: "Сучасний дизайн, підсвітка, алюмінієва шахта 60 см.",
    priceCents: 459000,
    imageUrl: "/products/hookahs/dschinni.jpg",
  },
  {
    id: "prod-kaljan-mattpear",
    categoryId: "cat-hookahs",
    name: "MattPear",
    description: "Ручна робота, матове скло, унікальний дизайн, висота 50 см.",
    priceCents: 1299000,
    imageUrl: "/products/hookahs/mattpear.jpg",
  },
  {
    id: "prod-kaljan-na-grani",
    categoryId: "cat-hookahs",
    name: "Na Grani Medium",
    description: "Український бренд, гранований дизайн, алюміній + скло.",
    priceCents: 349000,
    imageUrl: "/products/hookahs/na-grani.jpg",
    isAvailable: false,
  },

  // ── Tobacco (12) ──
  {
    id: "prod-tobacco-starbuzz",
    categoryId: "cat-tobacco",
    name: "Starbuzz Blue Mist",
    description: "Холодна м'ята з чорницями. Міцність: середня. Об'єм: 250г.",
    priceCents: 32000,
    imageUrl: "https://placehold.co/800x800/1e3a5f/eee?text=Starbuzz",
  },
  {
    id: "prod-tobacco-fumari",
    categoryId: "cat-tobacco",
    name: "Fumari White Gummi",
    description:
      "Солодкий гумовий ведмідь з лимоном. Міцність: легка. Об'єм: 100г.",
    priceCents: 22000,
    imageUrl: "https://placehold.co/800x800/533483/eee?text=Fumari",
  },
  {
    id: "prod-tobacco-darkside",
    categoryId: "cat-tobacco",
    name: "Darkside Cola",
    description:
      "Тютюн з насиченим смаком коли. Міцність: середня. Об'єм: 200г.",
    priceCents: 28000,
    imageUrl: "https://placehold.co/800x800/e94560/111?text=Darkside",
    isAvailable: false,
  },
  {
    id: "prod-tobacco-alfakher",
    categoryId: "cat-tobacco",
    name: "Al Fakher Double Apple",
    description:
      "Класичний подвійний яблуневий смак. Міцність: середня. Об'єм: 250г.",
    priceCents: 18000,
    imageUrl: "https://placehold.co/800x800/2d6a4f/eee?text=Al+Fakher",
  },
  {
    id: "prod-tobacco-musthave",
    categoryId: "cat-tobacco",
    name: "MustHave Pinkman",
    description:
      "Солодкий грейпфрут та лічі. Міцність: вище середньої. Об'єм: 200г.",
    priceCents: 35000,
    imageUrl: "https://placehold.co/800x800/e91e63/111?text=MustHave",
  },
  {
    id: "prod-tobacco-satyr",
    categoryId: "cat-tobacco",
    name: "Satyr Mango Lassi",
    description:
      "Манго та йогурт, вершковий смак. Міцність: середня. Об'єм: 200г.",
    priceCents: 29000,
    imageUrl: "https://placehold.co/800x800/ff9800/111?text=Satyr",
  },
  {
    id: "prod-tobacco-nakhla",
    categoryId: "cat-tobacco",
    name: "Nakhla Mix",
    description: "Східна суміш трав та фруктів. Міцність: міцний. Об'єм: 250г.",
    priceCents: 15000,
    imageUrl: "https://placehold.co/800x800/795548/eee?text=Nakhla",
  },
  {
    id: "prod-tobacco-element",
    categoryId: "cat-tobacco",
    name: "Element Air",
    description:
      "Легкий тютюн з ніжним фруктовим ароматом. Міцність: легка. Об'єм: 100г.",
    priceCents: 21000,
    imageUrl: "https://placehold.co/800x800/4caf50/111?text=Element",
  },
  {
    id: "prod-tobacco-bonche",
    categoryId: "cat-tobacco",
    name: "Bonche Mint",
    description:
      "Свіжа м'ята з холодком, ідеальна для міксів. Міцність: легка. Об'єм: 200г.",
    priceCents: 26000,
    imageUrl: "https://placehold.co/800x800/00bcd4/111?text=Bonche",
  },
  {
    id: "prod-tobacco-trifecta",
    categoryId: "cat-tobacco",
    name: "Trifecta Dark",
    description:
      "Темний лист, насичена нікотинова база. Міцність: міцна. Об'єм: 250г.",
    priceCents: 38000,
    imageUrl: "https://placehold.co/800x800/212121/eee?text=Trifecta",
  },
  {
    id: "prod-tobacco-adalya",
    categoryId: "cat-tobacco",
    name: "Adalya Love 66",
    description: "Полуниця, персик, кавун та м'ята. Міцність: легка. Об'єм: 200г.",
    priceCents: 25000,
    imageUrl: "https://placehold.co/800x800/e91e63/111?text=Adalya",
  },
  {
    id: "prod-tobacco-chabacco",
    categoryId: "cat-tobacco",
    name: "Chabacco Orange",
    description: "Соковитий апельсин з льодяним холодком. Міцність: середня. Об'єм: 200г.",
    priceCents: 27000,
    imageUrl: "https://placehold.co/800x800/ff6f00/111?text=Chabacco",
  },

  // ── Bowls (10) ──
  {
    id: "prod-bowl-clay",
    categoryId: "cat-bowls",
    name: "Глиняна чаша (traditional)",
    description: "Класична глиняна чаша для кальяну, добре тримає жар.",
    priceCents: 8500,
    imageUrl: "https://placehold.co/800x800/b74c20/eee?text=Clay+Bowl",
  },
  {
    id: "prod-bowl-phunnel",
    categoryId: "cat-bowls",
    name: "Phunnel bowl",
    description: "Чаша з одним отвором у центрі, не дає соку стікати в шахту.",
    priceCents: 15000,
    imageUrl: "https://placehold.co/800x800/c9a227/111?text=Phunnel",
  },
  {
    id: "prod-bowl-slesinger",
    categoryId: "cat-bowls",
    name: "Slesinger HMD",
    description: "Металевий дифузійний ковпак для чаші, рівномірний жар.",
    priceCents: 25000,
    imageUrl: "https://placehold.co/800x800/555/eee?text=HMD",
  },
  {
    id: "prod-bowl-silicone",
    categoryId: "cat-bowls",
    name: "Силіконова чаша",
    description: "Гнучка силіконова чаша, не б'ється, зручна для подорожей.",
    priceCents: 12000,
    imageUrl: "https://placehold.co/800x800/26a69a/111?text=Silicone",
  },
  {
    id: "prod-bowl-glass",
    categoryId: "cat-bowls",
    name: "Скляна чаша",
    description: "Прозора скляна чаша, естетичний вигляд, нейтральний смак.",
    priceCents: 18000,
    imageUrl: "https://placehold.co/800x800/80deea/111?text=Glass",
  },
  {
    id: "prod-bowl-vortex",
    categoryId: "cat-bowls",
    name: "Vortex bowl",
    description: "Vortex-чаша з спіральною тягою, рівномірне прокурювання.",
    priceCents: 20000,
    imageUrl: "https://placehold.co/800x800/7b1fa2/eee?text=Vortex",
  },
  {
    id: "prod-bowl-oblako",
    categoryId: "cat-bowls",
    name: "Oblako L",
    description: "Глиняна чаша від російського виробника, глибока, розрахована на 20-30г тютюну.",
    priceCents: 12000,
    imageUrl: "https://placehold.co/800x800/a1887f/111?text=Oblako",
  },
  {
    id: "prod-bowl-kong",
    categoryId: "cat-bowls",
    name: "Kong Phunnel",
    description: "Міцна phunnel-чаша з кераміки, не вбирає запахи, 25г.",
    priceCents: 16000,
    imageUrl: "https://placehold.co/800x800/795548/eee?text=Kong",
  },
  {
    id: "prod-bowl-ethros",
    categoryId: "cat-bowls",
    name: "Ethros",
    description: "Глиняна чаша ромбоподібної форми, відмінний розподіл жару.",
    priceCents: 14000,
    imageUrl: "https://placehold.co/800x800/bf360c/eee?text=Ethros",
  },
  {
    id: "prod-bowl-werkbund",
    categoryId: "cat-bowls",
    name: "Werkbund",
    description: "Німецька глиняна чаша з глазур'ю, рівномірне прокурювання.",
    priceCents: 22000,
    imageUrl: "https://placehold.co/800x800/5d4037/eee?text=Werkbund",
  },

  // ── Coals (10) ──
  {
    id: "prod-coal-coco",
    categoryId: "cat-coals",
    name: "Кокосове вугілля (25 шт)",
    description: "Швидкозапальні кокосові вугілля, жар тримає 40-60 хв.",
    priceCents: 9500,
    imageUrl: "https://placehold.co/800x800/222/eee?text=Coconut+Coal",
  },
  {
    id: "prod-coal-natural",
    categoryId: "cat-coals",
    name: "Натуральне вугілля (1 кг)",
    description:
      "Вугілля з букового дерева, без домішок. Потребує розпалювання.",
    priceCents: 12000,
    imageUrl: "https://placehold.co/800x800/3d3d3d/eee?text=Natural+Coal",
  },
  {
    id: "prod-coal-tablet",
    categoryId: "cat-coals",
    name: "Таблетоване вугілля (10 шт)",
    description:
      "Пресоване вугілля у формі таблеток, швидке запалювання, 30-40 хв жару.",
    priceCents: 6000,
    imageUrl: "https://placehold.co/800x800/1a1a1a/eee?text=Tablet+Coal",
  },
  {
    id: "prod-coal-electric",
    categoryId: "cat-coals",
    name: "Електричний нагрівач (калауд)",
    description:
      "Багаторазовий електричний нагрівач для чаші, без золи та диму.",
    priceCents: 45000,
    imageUrl: "https://placehold.co/800x800/455a64/eee?text=Electric+Heater",
  },
  {
    id: "prod-coal-bamboo",
    categoryId: "cat-coals",
    name: "Бамбукове вугілля (20 шт)",
    description: "Екологічне вугілля з бамбука, швидко запалюється, без запаху.",
    priceCents: 8500,
    imageUrl: "https://placehold.co/800x800/33691e/eee?text=Bamboo",
  },
  {
    id: "prod-coal-premium",
    categoryId: "cat-coals",
    name: "Преміум кокосове вугілля (30 шт)",
    description: "Кокосове вугілля преміум-класу, жар 50-70 хв, мінімум золи.",
    priceCents: 14000,
    imageUrl: "https://placehold.co/800x800/1b5e20/eee?text=Premium+Coal",
  },
  {
    id: "prod-coal-cube",
    categoryId: "cat-coals",
    name: "Кубикове вугілля (26 мм, 20 шт)",
    description: "Великі кубики 26 мм, довготривалий жар до 80 хв.",
    priceCents: 11000,
    imageUrl: "https://placehold.co/800x800/212121/eee?text=Cube+26mm",
  },
  {
    id: "prod-coal-flat",
    categoryId: "cat-coals",
    name: "Пластинчасте вугілля (10 шт)",
    description: "Тонке пластинчасте вугілля для швидкого розкурювання.",
    priceCents: 7000,
    imageUrl: "https://placehold.co/800x800/424242/eee?text=Flat+Coal",
  },
  {
    id: "prod-coal-titanium",
    categoryId: "cat-coals",
    name: "Titanium Coconut Coals (30 шт)",
    description: "Преміальні кокосові вугілля Titanium, жар 60+ хв.",
    priceCents: 16000,
    imageUrl: "https://placehold.co/800x800/37474f/eee?text=Titanium",
  },
  {
    id: "prod-coal-charcoal",
    categoryId: "cat-coals",
    name: "Деревне вугілля для тандиру (1 кг)",
    description: "Велике деревне вугілля для тандиру та грилю, не для кальяну.",
    priceCents: 9000,
    imageUrl: "https://placehold.co/800x800/3e2723/eee?text=Charcoal",
  },

  // ── Vapes (12) ──
  {
    id: "prod-vape-starter",
    categoryId: "cat-vapes",
    name: "Vaporesso XROS 3",
    description:
      "Портативна Pod-система, вбудована батарея 1000 мАг, змінні картриджі.",
    priceCents: 89000,
    imageUrl: "https://placehold.co/800x800/2d2d2d/eee?text=Vaporesso",
  },
  {
    id: "prod-vape-box",
    categoryId: "cat-vapes",
    name: "GeekVape Aegis Legend 3",
    description: "Потужний бокс-мод 200Вт, захист від води та пилу IP68.",
    priceCents: 259000,
    imageUrl: "https://placehold.co/800x800/1b1b2f/eee?text=GeekVape",
  },
  {
    id: "prod-vape-pod",
    categoryId: "cat-vapes",
    name: "SMOK Nord 5",
    description: "POD-система з регулюванням повітря, батарея 2000 мАг.",
    priceCents: 129000,
    imageUrl: "https://placehold.co/800x800/162447/eee?text=SMOK",
  },
  {
    id: "prod-vape-caliburn",
    categoryId: "cat-vapes",
    name: "Caliburn G3",
    description: "Тонка pod-система, 900 мАг, зарядка Type-C.",
    priceCents: 79000,
    imageUrl: "https://placehold.co/800x800/2e7d32/eee?text=Caliburn+G3",
  },
  {
    id: "prod-vape-oxva",
    categoryId: "cat-vapes",
    name: "OXVA Xlim Pro 2",
    description:
      "Регульована потужність 5-30Вт, змінні випарники, 1500 мАг.",
    priceCents: 99000,
    imageUrl: "https://placehold.co/800x800/6a1b9a/eee?text=OXVA",
  },
  {
    id: "prod-vape-lostvape",
    categoryId: "cat-vapes",
    name: "Lost Vape URSA Nano 3",
    description: "Мініатюрна pod-система з підігрівом 1-5 Вт, 1000 мАг.",
    priceCents: 85000,
    imageUrl: "https://placehold.co/800x800/004d40/eee?text=Lost+Vape",
  },
  {
    id: "prod-vape-aspire",
    categoryId: "cat-vapes",
    name: "Aspire PockeX",
    description: "Проста та надійна AIO-система, 1500 мАг, 2 мл картридж.",
    priceCents: 69000,
    imageUrl: "https://placehold.co/800x800/1565c0/eee?text=Aspire",
  },
  {
    id: "prod-vape-innokin",
    categoryId: "cat-vapes",
    name: "Innokin Endura T18 II",
    description: "Легка стартова pod-система, 1000 мАг, MTL-тяга.",
    priceCents: 55000,
    imageUrl: "https://placehold.co/800x800/00838f/eee?text=Innokin",
  },
  {
    id: "prod-vape-smoant",
    categoryId: "cat-vapes",
    name: "Smoant Pasito 2",
    description: "Універсальна pod-система з змінними котушками, 1100 мАг.",
    priceCents: 75000,
    imageUrl: "https://placehold.co/800x800/4e342e/eee?text=Smoant",
  },
  {
    id: "prod-vape-dovpo",
    categoryId: "cat-vapes",
    name: "Dovpo Topside Lite",
    description: "Бокс-мод з верхнім заповненням, 21700 акумулятор, 90 Вт.",
    priceCents: 189000,
    imageUrl: "https://placehold.co/800x800/263238/eee?text=Dovpo",
  },
  {
    id: "prod-vape-vandy",
    categoryId: "cat-vapes",
    name: "Vandy Vape Pulse 3",
    description: "Легкий squonk-мод, 95 Вт, під зарядку 18650/20700/21700.",
    priceCents: 169000,
    imageUrl: "https://placehold.co/800x800/311b92/eee?text=Vandy+Vape",
  },
  {
    id: "prod-vape-wotofo",
    categoryId: "cat-vapes",
    name: "Wotofo Profile AIO",
    description: "Вбудований mesh-випарник, 2000 мАг, регульована потужність.",
    priceCents: 110000,
    imageUrl: "https://placehold.co/800x800/01579b/eee?text=Wotofo",
  },

  // ── Liquids (12) ──
  {
    id: "prod-liquid-mint",
    categoryId: "cat-liquids",
    name: "Naked 100 Menthol",
    description: "М'ятна рідина з холодком. Нікотин: 3мг. Об'єм: 60мл.",
    priceCents: 25000,
    imageUrl: "https://placehold.co/800x800/00b4d8/111?text=Menthol",
  },
  {
    id: "prod-liquid-fruits",
    categoryId: "cat-liquids",
    name: "Jam Monster Strawberry",
    description:
      "Полуниця з тостами та вершковим маслом. Нікотин: 3мг. Об'єм: 100мл.",
    priceCents: 32000,
    imageUrl: "https://placehold.co/800x800/e63946/eee?text=Jam+Monster",
  },
  {
    id: "prod-liquid-candy",
    categoryId: "cat-liquids",
    name: "Yogi Energy",
    description:
      "Енергетичний напій з манго та гуавою. Нікотин: 6мг. Об'єм: 60мл.",
    priceCents: 28000,
    imageUrl: "https://placehold.co/800x800/fca311/111?text=Yogi",
  },
  {
    id: "prod-liquid-blueberry",
    categoryId: "cat-liquids",
    name: "Blueberry Ice",
    description: "Чорниця з м'ятою. Нікотин: 3мг. Об'єм: 60мл.",
    priceCents: 26000,
    imageUrl: "https://placehold.co/800x800/3f51b5/eee?text=Blueberry+Ice",
  },
  {
    id: "prod-liquid-mango",
    categoryId: "cat-liquids",
    name: "Mango Peach",
    description: "Манго та персик. Нікотин: 6мг. Об'єм: 60мл.",
    priceCents: 27000,
    imageUrl: "https://placehold.co/800x800/ff5722/111?text=Mango+Peach",
  },
  {
    id: "prod-liquid-grape",
    categoryId: "cat-liquids",
    name: "Grape Ice",
    description: "Виноград з льодяним холодком. Нікотин: 3мг. Об'єм: 100мл.",
    priceCents: 30000,
    imageUrl: "https://placehold.co/800x800/9c27b0/eee?text=Grape+Ice",
  },
  {
    id: "prod-liquid-watermelon",
    categoryId: "cat-liquids",
    name: "Watermelon Chill",
    description: "Кавунова свіжість. Нікотин: 0мг. Об'єм: 60мл.",
    priceCents: 24000,
    imageUrl: "https://placehold.co/800x800/4caf50/111?text=Watermelon",
  },
  {
    id: "prod-liquid-tobacco",
    categoryId: "cat-liquids",
    name: "Tobacco Blend Classic",
    description: "Класичний тютюновий смак. Нікотин: 12мг. Об'єм: 30мл.",
    priceCents: 22000,
    imageUrl: "https://placehold.co/800x800/5d4037/eee?text=Tobacco",
  },
  {
    id: "prod-liquid-strawberry",
    categoryId: "cat-liquids",
    name: "Strawberry Kiwi",
    description: "Полуниця з ківі. Нікотин: 3мг. Об'єм: 60мл.",
    priceCents: 26000,
    imageUrl: "https://placehold.co/800x800/f06292/111?text=Strawberry+Kiwi",
  },
  {
    id: "prod-liquid-lemon",
    categoryId: "cat-liquids",
    name: "Lemon Tart",
    description: "Лимонний пиріг з безе. Нікотин: 0мг. Об'єм: 60мл.",
    priceCents: 28000,
    imageUrl: "https://placehold.co/800x800/fff176/111?text=Lemon+Tart",
  },
  {
    id: "prod-liquid-pineapple",
    categoryId: "cat-liquids",
    name: "Pineapple Coconut",
    description: "Ананас з кокосом. Нікотин: 3мг. Об'єм: 100мл.",
    priceCents: 31000,
    imageUrl: "https://placehold.co/800x800/fff59d/111?text=Pineapple",
  },
  {
    id: "prod-liquid-cream",
    categoryId: "cat-liquids",
    name: "Vanilla Cream",
    description: "Ванільний крем з карамеллю. Нікотин: 6мг. Об'єм: 60мл.",
    priceCents: 27000,
    imageUrl: "https://placehold.co/800x800/bcaaa4/111?text=Vanilla",
  },

  // ── Accessories (12) ──
  {
    id: "prod-acc-hose",
    categoryId: "cat-accessories",
    name: "Силіконовий шланг",
    description: "Гнучкий силіконовий шланг для кальяну з ручкою.",
    priceCents: 3500,
    imageUrl: "https://placehold.co/800x800/4a4e69/eee?text=Hose",
  },
  {
    id: "prod-acc-tongs",
    categoryId: "cat-accessories",
    name: "Щипці для вугілля",
    description: "Нержавіюча сталь, зручна ручка, довжина 20 см.",
    priceCents: 2500,
    imageUrl: "https://placehold.co/800x800/9a8c98/eee?text=Tongs",
  },
  {
    id: "prod-acc-foil",
    categoryId: "cat-accessories",
    name: "Фольга (100 аркушів)",
    description: "Алюмінієва фольга для кальяну, товщина 25 мкм.",
    priceCents: 1800,
    imageUrl: "https://placehold.co/800x800/c0c0c0/333?text=Foil",
  },
  {
    id: "prod-acc-screen",
    categoryId: "cat-accessories",
    name: "Металева сітка",
    description: "Багаторазова металева сітка замість фольги.",
    priceCents: 1200,
    imageUrl: "https://placehold.co/800x800/adb5bd/333?text=Screen",
  },
  {
    id: "prod-acc-case",
    categoryId: "cat-accessories",
    name: "Кейс для кальяну",
    description: "Алюмінієвий кейс для транспортування, внутрішній поролон.",
    priceCents: 55000,
    imageUrl: "https://placehold.co/800x800/616161/eee?text=Case",
  },
  {
    id: "prod-acc-stem",
    categoryId: "cat-accessories",
    name: "Шахта для кальяну (50 см)",
    description: "Замінна шахта з нержавіючої сталі, 50 см.",
    priceCents: 18000,
    imageUrl: "https://placehold.co/800x800/78909c/111?text=Stem",
  },
  {
    id: "prod-acc-diffusor",
    categoryId: "cat-accessories",
    name: "Дифузор для шахти",
    description: "Силіконовий дифузор для шахти, додаткове пом'якшення тяги.",
    priceCents: 3000,
    imageUrl: "https://placehold.co/800x800/80cbc4/111?text=Diffusor",
  },
  {
    id: "prod-acc-seal",
    categoryId: "cat-accessories",
    name: "Ущільнювальні кільця (5 шт)",
    description: "Набір силіконових кілець для різних з'єднань кальяну.",
    priceCents: 1500,
    imageUrl: "https://placehold.co/800x800/b2dfdb/111?text=Seal+Rings",
  },
  {
    id: "prod-acc-adaptor",
    categoryId: "cat-accessories",
    name: "Адаптер для чаші (24→18 мм)",
    description: "Перехідник з 24 мм на 18 мм для сумісності чаш.",
    priceCents: 2000,
    imageUrl: "https://placehold.co/800x800/d7ccc8/111?text=Adaptor",
  },
  {
    id: "prod-acc-base",
    categoryId: "cat-accessories",
    name: "Основа для кальяну",
    description: "Силіконова стійка основа, антиковзна, для всіх типів кальянів.",
    priceCents: 4000,
    imageUrl: "https://placehold.co/800x800/424242/eee?text=Base",
  },
  {
    id: "prod-acc-bag",
    categoryId: "cat-accessories",
    name: "Сумка для кальяну",
    description: "Тканинна сумка для перенесення кальяну, розмір 80×25 см.",
    priceCents: 25000,
    imageUrl: "https://placehold.co/800x800/5d4037/eee?text=Bag",
  },
  {
    id: "prod-acc-grommet",
    categoryId: "cat-accessories",
    name: "Гуммет (10 шт)",
    description: "Силіконові гуммети для чаші, комплект 10 шт різних діаметрів.",
    priceCents: 1000,
    imageUrl: "https://placehold.co/800x800/e0e0e0/111?text=Grommet",
  },

  // ── Hoses (10) ──
  {
    id: "prod-hose-silicone",
    categoryId: "cat-hoses",
    name: "Силіконовий шланг преміум",
    description: "Преміальний силіконовий шланг з дерев'яною ручкою, 1.5 м.",
    priceCents: 5500,
    imageUrl: "https://placehold.co/800x800/8d6e63/eee?text=Premium+Hose",
  },
  {
    id: "prod-hose-leather",
    categoryId: "cat-hoses",
    name: "Шкіряний шланг",
    description: "Шланг в шкіряному обплетенні, стильний вигляд, 1.2 м.",
    priceCents: 12000,
    imageUrl: "https://placehold.co/800x800/a1887f/111?text=Leather+Hose",
  },
  {
    id: "prod-hose-mouth",
    categoryId: "cat-hoses",
    name: "Мундштук скляний",
    description:
      "Скляний мундштук ручної роботи, різьба 14 мм, нейтральний смак.",
    priceCents: 8000,
    imageUrl: "https://placehold.co/800x800/80cbc4/111?text=Glass+Mouth",
  },
  {
    id: "prod-hose-color",
    categoryId: "cat-hoses",
    name: "Силіконовий шланг кольоровий",
    description: "Яскравий силіконовий шланг, 1.2 м, вибір кольору.",
    priceCents: 4000,
    imageUrl: "https://placehold.co/800x800/e53935/eee?text=Color+Hose",
  },
  {
    id: "prod-hose-rubber",
    categoryId: "cat-hoses",
    name: "Гумовий шланг",
    description: "Класичний гумовий шланг, міцний, 1.5 м.",
    priceCents: 3000,
    imageUrl: "https://placehold.co/800x800/333/eee?text=Rubber+Hose",
  },
  {
    id: "prod-hose-long",
    categoryId: "cat-hoses",
    name: "Силіконовий шланг довгий (2 м)",
    description: "Довгий силіконовий шланг для великих компаній, 2 м.",
    priceCents: 6000,
    imageUrl: "https://placehold.co/800x800/666/eee?text=Long+Hose",
  },
  {
    id: "prod-hose-glass-mouth",
    categoryId: "cat-hoses",
    name: "Мундштук скляний гнутий",
    description: "Гнутий скляний мундштук ручної роботи, різьба 14 мм.",
    priceCents: 9500,
    imageUrl: "https://placehold.co/800x800/4dd0e1/111?text=Curved+Glass",
  },
  {
    id: "prod-hose-wood-mouth",
    categoryId: "cat-hoses",
    name: "Мундштук дерев'яний",
    description: "Дерев'яний мундштук з нержавіючої вставки, 14 мм.",
    priceCents: 7000,
    imageUrl: "https://placehold.co/800x800/8d6e63/eee?text=Wood+Mouth",
  },
  {
    id: "prod-hose-acrylic-mouth",
    categoryId: "cat-hoses",
    name: "Мундштук акриловий",
    description: "Легкий акриловий мундштук, різьба 14 мм, різні кольори.",
    priceCents: 3500,
    imageUrl: "https://placehold.co/800x800/ffb74d/111?text=Acrylic",
  },
  {
    id: "prod-hose-adaptor",
    categoryId: "cat-hoses",
    name: "Перехідник для шланга",
    description: "Адаптер для підключення шланга до кальяну, 2 шт.",
    priceCents: 2500,
    imageUrl: "https://placehold.co/800x800/90a4ae/111?text=Hose+Adaptor",
  },

  // ── Nic Salts (10) ──
  {
    id: "prod-salt-mango",
    categoryId: "cat-nic-salts",
    name: "Mango Salt 20мг",
    description: "Манго, нікотинові солі 20мг/мл. Об'єм: 30мл.",
    priceCents: 20000,
    imageUrl: "https://placehold.co/800x800/ffb300/111?text=Mango+Salt",
  },
  {
    id: "prod-salt-mint",
    categoryId: "cat-nic-salts",
    name: "Mint Salt 20мг",
    description: "М'ята, нікотинові солі 20мг/мл. Об'єм: 30мл.",
    priceCents: 20000,
    imageUrl: "https://placehold.co/800x800/00acc1/111?text=Mint+Salt",
  },
  {
    id: "prod-salt-lychee",
    categoryId: "cat-nic-salts",
    name: "Lychee Ice Salt 35мг",
    description: "Лічі з холодком, нікотинові солі 35мг/мл. Об'єм: 30мл.",
    priceCents: 22000,
    imageUrl: "https://placehold.co/800x800/e040fb/111?text=Lychee+Salt",
  },
  {
    id: "prod-salt-grape",
    categoryId: "cat-nic-salts",
    name: "Grape Salt 20мг",
    description: "Виноград, нікотинові солі 20мг/мл. Об'єм: 30мл.",
    priceCents: 20000,
    imageUrl: "https://placehold.co/800x800/7e57c2/eee?text=Grape+Salt",
  },
  {
    id: "prod-salt-strawberry",
    categoryId: "cat-nic-salts",
    name: "Strawberry Salt 20мг",
    description: "Полуниця, нікотинові солі 20мг/мл. Об'єм: 30мл.",
    priceCents: 20000,
    imageUrl: "https://placehold.co/800x800/e57373/111?text=Strawberry+Salt",
  },
  {
    id: "prod-salt-blueberry",
    categoryId: "cat-nic-salts",
    name: "Blueberry Salt 35мг",
    description: "Чорниця, нікотинові солі 35мг/мл. Об'єм: 30мл.",
    priceCents: 22000,
    imageUrl: "https://placehold.co/800x800/5c6bc0/eee?text=Blueberry+Salt",
  },
  {
    id: "prod-salt-watermelon",
    categoryId: "cat-nic-salts",
    name: "Watermelon Salt 20мг",
    description: "Кавун, нікотинові солі 20мг/мл. Об'єм: 30мл.",
    priceCents: 20000,
    imageUrl: "https://placehold.co/800x800/81c784/111?text=Watermelon+Salt",
  },
  {
    id: "prod-salt-peach",
    categoryId: "cat-nic-salts",
    name: "Peach Salt 35мг",
    description: "Персик, нікотинові солі 35мг/мл. Об'єм: 30мл.",
    priceCents: 22000,
    imageUrl: "https://placehold.co/800x800/ffab91/111?text=Peach+Salt",
  },
  {
    id: "prod-salt-menthol",
    categoryId: "cat-nic-salts",
    name: "Menthol Salt 50мг",
    description: "Ментол, нікотинові солі 50мг/мл. Об'єм: 30мл.",
    priceCents: 25000,
    imageUrl: "https://placehold.co/800x800/00acc1/111?text=Menthol+50",
  },
  {
    id: "prod-salt-tobacco",
    categoryId: "cat-nic-salts",
    name: "Tobacco Salt 20мг",
    description: "Тютюн, нікотинові солі 20мг/мл. Об'єм: 30мл.",
    priceCents: 20000,
    imageUrl: "https://placehold.co/800x800/6d4c41/eee?text=Tobacco+Salt",
  },

  // ── Disposables (10) ──
  {
    id: "prod-dispo-elf",
    categoryId: "cat-disposables",
    name: "Elf Bar 600",
    description:
      "Одноразова електронна сигарета, 600 тяг, 20мг нікотину, 10 смаків.",
    priceCents: 15000,
    imageUrl: "https://placehold.co/800x800/3949ab/eee?text=Elf+Bar+600",
  },
  {
    id: "prod-dispo-hqd",
    categoryId: "cat-disposables",
    name: "HQD Cuvie Plus",
    description: "Компактна одноразка, 1200 тяг, 50мг нікотину, 6 смаків.",
    priceCents: 18000,
    imageUrl: "https://placehold.co/800x800/c62828/eee?text=HQD+Cuvie",
  },
  {
    id: "prod-dispo-iget",
    categoryId: "cat-disposables",
    name: "iGet Legend",
    description: "Одноразова система, 3500 тяг, акумулятор 1500мАг.",
    priceCents: 35000,
    imageUrl: "https://placehold.co/800x800/283593/eee?text=iGet+Legend",
  },
  {
    id: "prod-dispo-fume",
    categoryId: "cat-disposables",
    name: "Fume Ultra",
    description:
      "Потужна одноразка, 5000 тяг, 5% нікотину, регульована тяга.",
    priceCents: 42000,
    imageUrl: "https://placehold.co/800x800/4e342e/eee?text=Fume+Ultra",
  },
  {
    id: "prod-dispo-elf-5000",
    categoryId: "cat-disposables",
    name: "Elf Bar 5000",
    description: "Одноразка з 5000 тяг, 15 мл рідини, 5% нікотину, акумулятор 650 мАг.",
    priceCents: 28000,
    imageUrl: "https://placehold.co/800x800/1a237e/eee?text=Elf+Bar+5000",
  },
  {
    id: "prod-dispo-hayati",
    categoryId: "cat-disposables",
    name: "Hayati Pro Max",
    description: "Потужна одноразка, 4000 тяг, регульована тяга, 20 смаків.",
    priceCents: 32000,
    imageUrl: "https://placehold.co/800x800/b71c1c/eee?text=Hayati",
  },
  {
    id: "prod-dispo-crystal",
    categoryId: "cat-disposables",
    name: "Crystal 3000",
    description: "Одноразова сигарета, 3000 тяг, 10 смаків, 5% нікотину.",
    priceCents: 22000,
    imageUrl: "https://placehold.co/800x800/ff8f00/111?text=Crystal",
  },
  {
    id: "prod-dispo-dinner",
    categoryId: "cat-disposables",
    name: "Dinner Lady",
    description: "Одноразка від відомого бренду, 600 тяг, 12 смаків.",
    priceCents: 16000,
    imageUrl: "https://placehold.co/800x800/ad1457/eee?text=Dinner+Lady",
  },
  {
    id: "prod-dispo-ske",
    categoryId: "cat-disposables",
    name: "SKE Crystal Bar",
    description: "Компактна одноразка, 600 тяг, 20мг нікотину, 10 смаків.",
    priceCents: 14000,
    imageUrl: "https://placehold.co/800x800/00695c/eee?text=SKE+Crystal",
  },
  {
    id: "prod-dispo-goldbar",
    categoryId: "cat-disposables",
    name: "Gold Bar",
    description: "Преміальна одноразка, 800 тяг, унікальні смаки, дизайн метал.",
    priceCents: 19000,
    imageUrl: "https://placehold.co/800x800/f57f17/111?text=Gold+Bar",
  },

  // ── Cleaning (12) ──
  {
    id: "prod-clean-brush",
    categoryId: "cat-cleaning",
    name: "Йоршик для миття шахти",
    description:
      "Гнучкий йоршик з нейлону для чищення шахти кальяну, довжина 70 см.",
    priceCents: 4500,
    imageUrl: "https://placehold.co/800x800/607d8b/eee?text=Cleaning+Brush",
  },
  {
    id: "prod-clean-wipes",
    categoryId: "cat-cleaning",
    name: "Серветки для догляду (50 шт)",
    description: "Вологі серветки для чищення кальяну та аксесуарів.",
    priceCents: 1500,
    imageUrl: "https://placehold.co/800x800/90a4ae/111?text=Wipes",
  },
  {
    id: "prod-clean-set",
    categoryId: "cat-cleaning",
    name: "Набір для чищення кальяну",
    description:
      "Повний набір: йоршик, серветки, рідина для чищення, 3 предмети.",
    priceCents: 12000,
    imageUrl: "https://placehold.co/800x800/546e7a/eee?text=Cleaning+Kit",
  },
  {
    id: "prod-clean-liquid",
    categoryId: "cat-cleaning",
    name: "Рідина для чищення (500 мл)",
    description: "Спеціальна рідина для видалення нальоту та запаху з кальяну.",
    priceCents: 8000,
    imageUrl: "https://placehold.co/800x800/4db6ac/111?text=Clean+Liquid",
  },
  {
    id: "prod-clean-sponge",
    categoryId: "cat-cleaning",
    name: "Губки для чищення (5 шт)",
    description: "Абразивні губки для чищення чаш та колби, 5 шт.",
    priceCents: 2000,
    imageUrl: "https://placehold.co/800x800/80cbc4/111?text=Sponges",
  },
  {
    id: "prod-clean-brush-small",
    categoryId: "cat-cleaning",
    name: "Йоршик малий (30 см)",
    description: "Короткий йоршик для чищення портів та з'єднань, 30 см.",
    priceCents: 2500,
    imageUrl: "https://placehold.co/800x800/78909c/111?text=Small+Brush",
  },
  {
    id: "prod-clean-brush-silicone",
    categoryId: "cat-cleaning",
    name: "Йоршик силіконовий",
    description: "Гнучкий силіконовий йоршик, не дряпає поверхні, 60 см.",
    priceCents: 3500,
    imageUrl: "https://placehold.co/800x800/4fc3f7/111?text=Silicone+Brush",
  },
  {
    id: "prod-clean-tube",
    categoryId: "cat-cleaning",
    name: "Трубчастий йоршик",
    description: "Довгий трубчастий йоршик для чищення шлангів, 1.5 м.",
    priceCents: 3000,
    imageUrl: "https://placehold.co/800x800/90caf9/111?text=Tube+Brush",
  },
  {
    id: "prod-clean-nozzle",
    categoryId: "cat-cleaning",
    name: "Набір насадок для чищення",
    description: "5 різних насадок для важкодоступних місць кальяну.",
    priceCents: 5000,
    imageUrl: "https://placehold.co/800x800/b39ddb/111?text=Nozzle+Set",
  },
  {
    id: "prod-clean-set-premium",
    categoryId: "cat-cleaning",
    name: "Набір для чищення преміум",
    description: "Професійний набір: рідина, спрей, 3 йоршики, серветки, рукавички.",
    priceCents: 22000,
    imageUrl: "https://placehold.co/800x800/37474f/eee?text=Premium+Kit",
  },
  {
    id: "prod-clean-cloth",
    categoryId: "cat-cleaning",
    name: "Мікрофібра для полірування",
    description: "Серветка з мікрофібри для полірування колби та металу.",
    priceCents: 1800,
    imageUrl: "https://placehold.co/800x800/e0e0e0/111?text=Microfiber",
  },
  {
    id: "prod-clean-decalcifier",
    categoryId: "cat-cleaning",
    name: "Засіб від накипу (300 мл)",
    description: "Рідина для видалення вапняного нальоту зі скляних колб.",
    priceCents: 6000,
    imageUrl: "https://placehold.co/800x800/a5d6a7/111?text=Decalcifier",
  },
];

const productVariants = [
  // ── Liquids ──
  {
    productId: "prod-liquid-mint",
    tastes: ["Крижана м'ята", "Ментол", "М'ята-лайм"],
    sizes: [
      { size: "10 мл", priceCents: 15000 },
      { size: "30 мл", priceCents: 25000 },
    ],
    description: "Освіжаюча м'ятна рідина з холодком у кожній затяжці.",
    descriptions: {
      "Крижана м'ята": "Пронизливий крижаний холод із солодкуватою м'ятою.",
      "Ментол": "Чистий ментол — різка свіжість без зайвої солодкості.",
      "М'ята-лайм": "Прохолодна м'ята з цитрусовою кислинкою лайма.",
    },
  },
  {
    productId: "prod-liquid-fruits",
    tastes: ["Полуниця", "Кавун", "Манго-маракуйя"],
    sizes: [
      { size: "10 мл", priceCents: 18000 },
      { size: "30 мл", priceCents: 32000 },
    ],
    description: "Соковитий мікс фруктів для насиченого та яскравого смаку.",
    descriptions: {
      "Полуниця": "Стигла солодка полуниця з літнім ароматом.",
      "Кавун": "Соковитий кавун — легкий та освіжаючий смак.",
      "Манго-маракуйя": "Тропічний дует манго та маракуйї з кислинкою.",
    },
  },
  {
    productId: "prod-liquid-candy",
    tastes: ["Енергетик", "Кола-лимон", "Жуйка"],
    sizes: [
      { size: "10 мл", priceCents: 16000 },
      { size: "30 мл", priceCents: 28000 },
    ],
    description: "Солодкі нотки улюблених цукерок та напоїв.",
    descriptions: {
      "Енергетик": "Тонізуючий смак класичного енергетика з льодом.",
      "Кола-лимон": "Газована кола з лимонною свіжістю.",
      "Жуйка": "Солодка фруктова жуйка з дитинства.",
    },
  },
  {
    productId: "prod-liquid-blueberry",
    tastes: ["Чорниця", "Чорниця-лайм", "Чорниця-малина"],
    sizes: [
      { size: "10 мл", priceCents: 15000 },
      { size: "30 мл", priceCents: 26000 },
    ],
    description: "Ніжний смак чорниці з ягідними акцентами.",
    descriptions: {
      "Чорниця": "Ніжна лісова чорниця з м'якою солодкістю.",
      "Чорниця-лайм": "Чорниця з бадьорою кислинкою лайма.",
      "Чорниця-малина": "Ягідний мікс чорниці та солодкої малини.",
    },
  },
  {
    productId: "prod-liquid-mango",
    tastes: ["Манго", "Манго-персик", "Манго-маракуйя"],
    sizes: [
      { size: "10 мл", priceCents: 16000 },
      { size: "30 мл", priceCents: 27000 },
    ],
    description: "Тропічна соковитість манго в кожній затяжці.",
    descriptions: {
      "Манго": "Стигле тропічне манго — густий солодкий смак.",
      "Манго-персик": "Манго з ніжною персиковою м'якоттю.",
      "Манго-маракуйя": "Манго з екзотичною кислинкою маракуйї.",
    },
  },
  {
    productId: "prod-liquid-grape",
    tastes: ["Виноград", "Виноград-яблуко", "Виноград-кавун"],
    sizes: [
      { size: "10 мл", priceCents: 17000 },
      { size: "30 мл", priceCents: 30000 },
    ],
    description: "Насичений виноградний смак з фруктовими відтінками.",
    descriptions: {
      "Виноград": "Насичений смак темного винограду.",
      "Виноград-яблуко": "Виноград із хрусткою яблучною свіжістю.",
      "Виноград-кавун": "Виноград і соковитий кавун — легкий літній мікс.",
    },
  },
  {
    productId: "prod-liquid-watermelon",
    tastes: ["Кавун", "Кавун-димчастий", "Кавун-полуниця"],
    sizes: [
      { size: "10 мл", priceCents: 14000 },
      { size: "30 мл", priceCents: 24000 },
    ],
    description: "Свіжий кавуновий смак — ідеально для спекотного літа.",
    descriptions: {
      "Кавун": "Класичний соковитий кавун без зайвого.",
      "Кавун-димчастий": "Кавун із пікантним димчастим післясмаком.",
      "Кавун-полуниця": "Солодкий дует кавуна та стиглої полуниці.",
    },
  },
  {
    productId: "prod-liquid-tobacco",
    tastes: ["Тютюн класичний", "Тютюн-горіх", "Тютюн-карамель"],
    sizes: [
      { size: "10 мл", priceCents: 13000 },
      { size: "30 мл", priceCents: 22000 },
    ],
    description: "Класичний тютюновий смак з глибокими деревними нотами.",
    descriptions: {
      "Тютюн класичний": "Чистий тютюновий смак із деревними нотами.",
      "Тютюн-горіх": "Тютюн із теплим горіховим відтінком.",
      "Тютюн-карамель": "Тютюн, пом'якшений вершковою карамеллю.",
    },
  },
  {
    productId: "prod-liquid-strawberry",
    tastes: ["Полуниця", "Полуниця-ківі", "Полуниця-лайм"],
    sizes: [
      { size: "10 мл", priceCents: 15000 },
      { size: "30 мл", priceCents: 26000 },
    ],
    description: "Солодка полуниця з легкою кислинкою тропічних фруктів.",
    descriptions: {
      "Полуниця": "Солодка стигла полуниця в чистому вигляді.",
      "Полуниця-ківі": "Полуниця з терпкою свіжістю ківі.",
      "Полуниця-лайм": "Полуниця з цитрусовою кислинкою лайма.",
    },
  },
  {
    productId: "prod-liquid-lemon",
    tastes: ["Лимон", "Лимон-безe", "Лимон-лайм"],
    sizes: [
      { size: "10 мл", priceCents: 16000 },
      { size: "30 мл", priceCents: 28000 },
    ],
    description: "Цитрусова свіжість лимона в кожній краплі.",
    descriptions: {
      "Лимон": "Яскравий кислий лимон — максимум цитрусової свіжості.",
      "Лимон-безe": "Лимонний крем із солодким повітряним безе.",
      "Лимон-лайм": "Подвійний цитрус — лимон із терпким лаймом.",
    },
  },
  {
    productId: "prod-liquid-pineapple",
    tastes: ["Ананас", "Ананас-кокос", "Ананас-манго"],
    sizes: [
      { size: "10 мл", priceCents: 17000 },
      { size: "30 мл", priceCents: 31000 },
    ],
    description: "Екзотичний ананас із тропічним кокосовим шлейфом.",
    descriptions: {
      "Ананас": "Соковитий стиглий ананас із легкою кислинкою.",
      "Ананас-кокос": "Тропічна піна-колада з ананаса та кокоса.",
      "Ананас-манго": "Ананас із солодкою м'якоттю манго.",
    },
  },
  {
    productId: "prod-liquid-cream",
    tastes: ["Ваніль", "Ваніль-карамель", "Ваніль-кокос"],
    sizes: [
      { size: "10 мл", priceCents: 15000 },
      { size: "30 мл", priceCents: 27000 },
    ],
    description: "Вершкова ніжність ванілі з карамельним відтінком.",
    descriptions: {
      "Ваніль": "Ніжний вершковий смак натуральної ванілі.",
      "Ваніль-карамель": "Ваніль із тягучою вершковою карамеллю.",
      "Ваніль-кокос": "Ванільний крем з екзотичною кокосовою стружкою.",
    },
  },

  // ── Coals ──
  {
    productId: "prod-coal-coco",
    sizes: [
      { size: "250 г", priceCents: 9500 },
      { size: "500 г", priceCents: 17000 },
      { size: "1 кг", priceCents: 30000 },
    ],
    description: "Кокосове вугілля — довгий жар без сторонніх запахів.",
  },
  {
    productId: "prod-coal-natural",
    sizes: [
      { size: "500 г", priceCents: 7000 },
      { size: "1 кг", priceCents: 12000 },
      { size: "3 кг", priceCents: 33000 },
    ],
    description: "Натуральне пресоване вугілля з екологічно чистої деревини.",
  },
  {
    productId: "prod-coal-tablet",
    sizes: [
      { size: "10 шт", priceCents: 6000 },
      { size: "30 шт", priceCents: 16000 },
      { size: "60 шт", priceCents: 28000 },
    ],
    description: "Швидкорозпалювальне вугілля-таблетки для зручного старту.",
  },
  {
    productId: "prod-coal-bamboo",
    sizes: [
      { size: "10 шт", priceCents: 4500 },
      { size: "20 шт", priceCents: 8500 },
      { size: "40 шт", priceCents: 15000 },
    ],
    description: "Бамбукове вугілля — екологічно чистий жар без домішок.",
  },
  {
    productId: "prod-coal-premium",
    sizes: [
      { size: "15 шт", priceCents: 7500 },
      { size: "30 шт", priceCents: 14000 },
      { size: "60 шт", priceCents: 26000 },
    ],
    description: "Преміум вугілля для ідеального розкурювання кальяну.",
  },
  {
    productId: "prod-coal-cube",
    sizes: [
      { size: "10 шт", priceCents: 6000 },
      { size: "20 шт", priceCents: 11000 },
      { size: "40 шт", priceCents: 20000 },
    ],
    description: "Кубикове вугілля — рівномірний жар на довгий час куріння.",
  },
  {
    productId: "prod-coal-flat",
    sizes: [
      { size: "10 шт", priceCents: 7000 },
      { size: "20 шт", priceCents: 13000 },
    ],
    description: "Пластинчасте вугілля для швидкого та рівномірного розігріву.",
  },
  {
    productId: "prod-coal-titanium",
    sizes: [
      { size: "15 шт", priceCents: 9000 },
      { size: "30 шт", priceCents: 16000 },
      { size: "60 шт", priceCents: 30000 },
    ],
    description: "Титанове вугілля — максимальна температура та тривалий жар.",
  },

  // ── Nic Salts ──
  {
    productId: "prod-salt-mango",
    tastes: ["Манго", "Манго-маракуйя", "Манго-персик"],
    sizes: [
      { size: "10 мл", priceCents: 12000 },
      { size: "30 мл", priceCents: 20000 },
    ],
    description: "Сольова рідина з насиченим смаком стиглого манго.",
    descriptions: {
      "Манго": "Насичене стигле манго з м'якою сольовою подачею.",
      "Манго-маракуйя": "Манго з кислинкою маракуйї на сольовій основі.",
      "Манго-персик": "Солодкий дует манго та персика на сольовій основі.",
    },
  },
  {
    productId: "prod-salt-mint",
    tastes: ["М'ята", "М'ята-лайм", "М'ята-виноград"],
    sizes: [
      { size: "10 мл", priceCents: 12000 },
      { size: "30 мл", priceCents: 20000 },
    ],
    description: "Сольова рідина з освіжаючою холодною м'ятою.",
    descriptions: {
      "М'ята": "Холодна м'ята з м'якою сольовою подачею.",
      "М'ята-лайм": "М'ята з освіжаючою цитрусовою кислинкою лайма.",
      "М'ята-виноград": "Прохолодна м'ята із солодким виноградом.",
    },
  },
  {
    productId: "prod-salt-lychee",
    tastes: ["Лічі", "Лічі-малина", "Лічі-лайм"],
    sizes: [
      { size: "10 мл", priceCents: 13000 },
      { size: "30 мл", priceCents: 22000 },
    ],
    description: "Сольова рідина з екзотичним смаком лічі та ягід.",
    descriptions: {
      "Лічі": "Екзотичне солодке лічі з квітковими нотами.",
      "Лічі-малина": "Лічі з ягідною солодкістю малини.",
      "Лічі-лайм": "Лічі з терпкою свіжістю лайма.",
    },
  },
  {
    productId: "prod-salt-grape",
    tastes: ["Виноград", "Виноград-м'ята", "Виноград-яблуко"],
    sizes: [
      { size: "10 мл", priceCents: 12000 },
      { size: "30 мл", priceCents: 20000 },
    ],
    description: "Сольова рідина з соковитим виноградним смаком.",
    descriptions: {
      "Виноград": "Соковитий темний виноград на сольовій основі.",
      "Виноград-м'ята": "Виноград із прохолодним м'ятним фінішем.",
      "Виноград-яблуко": "Виноград із соковитим зеленим яблуком.",
    },
  },
  {
    productId: "prod-salt-strawberry",
    tastes: ["Полуниця", "Полуниця-лайм", "Полуниця-кавун"],
    sizes: [
      { size: "10 мл", priceCents: 12000 },
      { size: "30 мл", priceCents: 20000 },
    ],
    description: "Сольова рідина зі смаком стиглої літньої полуниці.",
    descriptions: {
      "Полуниця": "Стигла літня полуниця з м'якою подачею.",
      "Полуниця-лайм": "Полуниця з бадьорою кислинкою лайма.",
      "Полуниця-кавун": "Полуниця із соковитим освіжаючим кавуном.",
    },
  },
  {
    productId: "prod-salt-blueberry",
    tastes: ["Чорниця", "Чорниця-малина", "Чорниця-гранат"],
    sizes: [
      { size: "10 мл", priceCents: 13000 },
      { size: "30 мл", priceCents: 22000 },
    ],
    description: "Сольова рідина з насиченим ягідним смаком чорниці.",
    descriptions: {
      "Чорниця": "Насичена лісова чорниця на сольовій основі.",
      "Чорниця-малина": "Чорниця із солодкою садовою малиною.",
      "Чорниця-гранат": "Чорниця з терпкими нотами стиглого граната.",
    },
  },
  {
    productId: "prod-salt-watermelon",
    tastes: ["Кавун", "Кавун-димчастий", "Кавун-полуниця"],
    sizes: [
      { size: "10 мл", priceCents: 12000 },
      { size: "30 мл", priceCents: 20000 },
    ],
    description: "Сольова рідина зі свіжим кавуновим смаком.",
    descriptions: {
      "Кавун": "Свіжий соковитий кавун на сольовій основі.",
      "Кавун-димчастий": "Кавун із легким димчастим відтінком.",
      "Кавун-полуниця": "Кавун із солодкою стиглою полуницею.",
    },
  },
  {
    productId: "prod-salt-peach",
    tastes: ["Персик", "Персик-абрикос", "Персик-маракуйя"],
    sizes: [
      { size: "10 мл", priceCents: 13000 },
      { size: "30 мл", priceCents: 22000 },
    ],
    description: "Сольова рідина з соковитим персиковим смаком.",
    descriptions: {
      "Персик": "Соковитий персик із ніжною солодкістю.",
      "Персик-абрикос": "Персик із медовим абрикосовим відтінком.",
      "Персик-маракуйя": "Персик з екзотичною кислинкою маракуйї.",
    },
  },
  {
    productId: "prod-salt-menthol",
    tastes: ["Ментол", "Ментол-лайм", "Ментол-евкаліпт"],
    sizes: [
      { size: "10 мл", priceCents: 14000 },
      { size: "30 мл", priceCents: 25000 },
    ],
    description: "Сольова рідина з ментоловою свіжістю та лікарськими травами.",
    descriptions: {
      "Ментол": "Чистий крижаний ментол — максимальна свіжість.",
      "Ментол-лайм": "Ментол із цитрусовою кислинкою лайма.",
      "Ментол-евкаліпт": "Ментол із трав'яною свіжістю евкаліпта.",
    },
  },
  {
    productId: "prod-salt-tobacco",
    tastes: ["Тютюн", "Тютюн-горіх", "Тютюн-карамель"],
    sizes: [
      { size: "10 мл", priceCents: 12000 },
      { size: "30 мл", priceCents: 20000 },
    ],
    description: "Сольова рідина з класичним тютюновим смаком.",
    descriptions: {
      "Тютюн": "Класичний тютюновий смак на сольовій основі.",
      "Тютюн-горіх": "Тютюн із теплими горіховими нотами.",
      "Тютюн-карамель": "Тютюн із солодкою вершковою карамеллю.",
    },
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
      { productId: "prod-kaljan-amstaff", quantity: 1 },
      { productId: "prod-bowl-phunnel", quantity: 1 },
      { productId: "prod-coal-coco", quantity: 2 },
    ],
  },
  {
    id: "order-tobacco-run",
    customerId: "customer-dmytro",
    paymentMethod: "CASH",
    status: "COMPLETED",
    createdAt: atNoon("2026-07-10"),
    items: [
      { productId: "prod-tobacco-starbuzz", quantity: 1 },
      { productId: "prod-tobacco-darkside", quantity: 1 },
      { productId: "prod-acc-tongs", quantity: 1 },
    ],
  },
  {
    id: "order-vape-kit",
    customerId: "customer-artem",
    paymentMethod: "CARD",
    status: "COMPLETED",
    createdAt: atNoon("2026-07-11"),
    items: [
      { productId: "prod-vape-starter", quantity: 1 },
      { productId: "prod-liquid-mint", quantity: 2 },
    ],
  },
  {
    id: "order-mixed",
    customerId: "customer-maria",
    paymentMethod: "CARD",
    status: "PROCESSING",
    createdAt: atNoon("2026-07-12"),
    items: [
      { productId: "prod-kaljan-travel", quantity: 1 },
      { productId: "prod-tobacco-alfakher", quantity: 1 },
      { productId: "prod-coal-natural", quantity: 1 },
      { productId: "prod-acc-foil", quantity: 2 },
    ],
  },
  {
    id: "order-vape-liquid",
    customerId: "customer-guest-phone",
    paymentMethod: "CASH",
    status: "NEW",
    createdAt: atNoon("2026-07-13"),
    items: [
      { productId: "prod-liquid-fruits", quantity: 1 },
      { productId: "prod-liquid-candy", quantity: 1 },
      { productId: "prod-acc-screen", quantity: 3 },
    ],
  },
  {
    id: "order-premium-hookah",
    customerId: "customer-artem",
    paymentMethod: "BONUS",
    status: "COMPLETED",
    createdAt: atNoon("2026-07-13"),
    items: [
      { productId: "prod-kaljan-amy", quantity: 1 },
      { productId: "prod-bowl-slesinger", quantity: 1 },
      { productId: "prod-tobacco-fumari", quantity: 2 },
    ],
  },
  {
    id: "order-box-mod",
    customerId: "customer-olena",
    paymentMethod: "CARD",
    status: "NEW",
    createdAt: atNoon("2026-07-14"),
    items: [
      { productId: "prod-vape-box", quantity: 1 },
      { productId: "prod-liquid-mint", quantity: 1 },
      { productId: "prod-liquid-fruits", quantity: 1 },
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
      { productId: "prod-salt-mango", quantity: 2 },
      { productId: "prod-salt-mint", quantity: 1 },
      { productId: "prod-dispo-elf", quantity: 3 },
    ],
  },
  {
    id: "order-cleaning-kit",
    customerId: "customer-natalia",
    paymentMethod: "CARD",
    status: "COMPLETED",
    createdAt: atNoon("2026-07-15"),
    items: [
      { productId: "prod-clean-set", quantity: 1 },
      { productId: "prod-clean-brush", quantity: 2 },
      { productId: "prod-acc-hose", quantity: 1 },
    ],
  },
  {
    id: "order-disposables-bulk",
    customerId: "customer-oleksandr",
    paymentMethod: "CASH",
    status: "NEW",
    createdAt: atNoon("2026-07-15"),
    items: [
      { productId: "prod-dispo-hqd", quantity: 5 },
      { productId: "prod-dispo-iget", quantity: 2 },
    ],
  },
  {
    id: "order-premium-tobacco",
    customerId: "customer-yulia",
    paymentMethod: "CARD",
    status: "COMPLETED",
    createdAt: atNoon("2026-07-15"),
    items: [
      { productId: "prod-tobacco-musthave", quantity: 1 },
      { productId: "prod-tobacco-trifecta", quantity: 1 },
      { productId: "prod-tobacco-satyr", quantity: 2 },
      { productId: "prod-bowl-silicone", quantity: 1 },
    ],
  },
  {
    id: "order-hoses",
    customerId: "customer-dmytro",
    paymentMethod: "CARD",
    status: "PROCESSING",
    createdAt: atNoon("2026-07-16"),
    items: [
      { productId: "prod-hose-leather", quantity: 1 },
      { productId: "prod-hose-silicone", quantity: 2 },
      { productId: "prod-hose-mouth", quantity: 2 },
    ],
  },
  {
    id: "order-caliburn-kit",
    customerId: "customer-ivan",
    paymentMethod: "BONUS",
    status: "COMPLETED",
    createdAt: atNoon("2026-07-16"),
    items: [
      { productId: "prod-vape-caliburn", quantity: 1 },
      { productId: "prod-liquid-grape", quantity: 2 },
      { productId: "prod-salt-lychee", quantity: 1 },
    ],
  },
  {
    id: "order-electric-coal",
    customerId: "customer-maria",
    paymentMethod: "CARD",
    status: "NEW",
    createdAt: atNoon("2026-07-17"),
    items: [
      { productId: "prod-coal-electric", quantity: 1 },
      { productId: "prod-bowl-vortex", quantity: 1 },
      { productId: "prod-tobacco-element", quantity: 2 },
    ],
  },
  {
    id: "order-large-mixed",
    customerId: "customer-artem",
    paymentMethod: "CARD",
    status: "COMPLETED",
    createdAt: atNoon("2026-07-17"),
    items: [
      { productId: "prod-kaljan-storm", quantity: 1 },
      { productId: "prod-kaljan-union", quantity: 1 },
      { productId: "prod-bowl-glass", quantity: 2 },
      { productId: "prod-coal-tablet", quantity: 1 },
      { productId: "prod-acc-case", quantity: 1 },
    ],
  },
  {
    id: "order-zero-nic",
    customerId: "customer-natalia",
    paymentMethod: "CASH",
    status: "NEW",
    createdAt: atNoon("2026-07-18"),
    items: [
      { productId: "prod-liquid-watermelon", quantity: 3 },
      { productId: "prod-liquid-tobacco", quantity: 1 },
      { productId: "prod-vape-lostvape", quantity: 1 },
    ],
  },
  {
    id: "order-alpha-premium",
    customerId: "customer-ivan",
    paymentMethod: "CARD",
    status: "COMPLETED",
    createdAt: atNoon("2026-07-18"),
    items: [
      { productId: "prod-kaljan-alpha", quantity: 1 },
      { productId: "prod-bowl-oblako", quantity: 1 },
      { productId: "prod-coal-titanium", quantity: 2 },
      { productId: "prod-hose-leather", quantity: 1 },
    ],
  },
  {
    id: "order-salts-bulk",
    customerId: "customer-oleksandr",
    paymentMethod: "CARD",
    status: "PROCESSING",
    createdAt: atNoon("2026-07-18"),
    items: [
      { productId: "prod-salt-strawberry", quantity: 2 },
      { productId: "prod-salt-blueberry", quantity: 2 },
      { productId: "prod-salt-menthol", quantity: 1 },
      { productId: "prod-salt-tobacco", quantity: 1 },
    ],
  },
  {
    id: "order-cleaning-premium",
    customerId: "customer-yulia",
    paymentMethod: "CARD",
    status: "COMPLETED",
    createdAt: atNoon("2026-07-18"),
    items: [
      { productId: "prod-clean-set-premium", quantity: 1 },
      { productId: "prod-clean-liquid", quantity: 2 },
      { productId: "prod-clean-decalcifier", quantity: 1 },
      { productId: "prod-clean-cloth", quantity: 3 },
    ],
  },
  {
    id: "order-disposables-mixed",
    customerId: "customer-natalia",
    paymentMethod: "CASH",
    status: "NEW",
    createdAt: atNoon("2026-07-18"),
    items: [
      { productId: "prod-dispo-elf-5000", quantity: 2 },
      { productId: "prod-dispo-hayati", quantity: 1 },
      { productId: "prod-dispo-crystal", quantity: 3 },
      { productId: "prod-dispo-ske", quantity: 2 },
    ],
  },
  {
    id: "order-hoses-accessories",
    customerId: "customer-artem",
    paymentMethod: "CARD",
    status: "COMPLETED",
    createdAt: atNoon("2026-07-18"),
    items: [
      { productId: "prod-hose-color", quantity: 2 },
      { productId: "prod-hose-long", quantity: 1 },
      { productId: "prod-hose-glass-mouth", quantity: 2 },
      { productId: "prod-hose-adaptor", quantity: 1 },
      { productId: "prod-acc-diffusor", quantity: 2 },
    ],
  },
  {
    id: "order-vape-new",
    customerId: "customer-dmytro",
    paymentMethod: "CARD",
    status: "PROCESSING",
    createdAt: atNoon("2026-07-18"),
    items: [
      { productId: "prod-vape-smoant", quantity: 1 },
      { productId: "prod-vape-innokin", quantity: 1 },
      { productId: "prod-liquid-strawberry", quantity: 2 },
      { productId: "prod-liquid-lemon", quantity: 1 },
    ],
  },
  {
    id: "order-bowl-collection",
    customerId: "customer-maria",
    paymentMethod: "BONUS",
    status: "NEW",
    createdAt: atNoon("2026-07-18"),
    items: [
      { productId: "prod-bowl-ethros", quantity: 1 },
      { productId: "prod-bowl-werkbund", quantity: 1 },
      { productId: "prod-bowl-kong", quantity: 1 },
      { productId: "prod-acc-grommet", quantity: 2 },
      { productId: "prod-acc-seal", quantity: 1 },
    ],
  },
  {
    id: "order-na-grani",
    customerId: "customer-ivan",
    paymentMethod: "CARD",
    status: "PROCESSING",
    createdAt: atNoon("2026-07-18"),
    items: [
      { productId: "prod-kaljan-na-grani", quantity: 1 },
      { productId: "prod-coal-bamboo", quantity: 2 },
      { productId: "prod-coal-premium", quantity: 1 },
      { productId: "prod-tobacco-adalya", quantity: 2 },
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
      const tasteName = taste?.name ?? taste;
      const tasteDesc =
        taste?.description ?? (taste ? spec.descriptions?.[taste] : null) ?? null;
      for (const { size, priceCents } of spec.sizes) {
        await prisma.productVariant.create({
          data: {
            productId: spec.productId,
            taste: tasteName,
            size,
            price: money(priceCents),
            description: tasteDesc ?? spec.description ?? null,
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
  for (const order of orders) {
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
    `Seeded ${categories.length} categories, ${products.length} products, ${variantCount} variants, ${customers.length} customers (+${admins.length} admin${admins.length === 1 ? "" : "s"}: ${admins.map((entry) => entry.email).join(", ")}), ${orders.length} orders.`,
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
