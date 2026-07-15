require("dotenv/config");

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

const categories = [
  { id: "cat-hookahs", name: "Кальяни", slug: "hookahs" },
  { id: "cat-tobacco", name: "Тютюн для кальяну", slug: "tobacco" },
  { id: "cat-bowls", name: "Чаші", slug: "bowls" },
  { id: "cat-coals", name: "Вугілля", slug: "coals" },
  { id: "cat-vapes", name: "Вейпи", slug: "vapes" },
  { id: "cat-liquids", name: "Рідини для вейпів", slug: "liquids" },
  { id: "cat-accessories", name: "Аксесуари", slug: "accessories" },
];

const products = [
  {
    id: "prod-kaljan-amstaff",
    categoryId: "cat-hookahs",
    name: "Kaljan Amstaff 580 Pro",
    description: "Кальян середнього розміру з алюмінієвим шахтом, компактний та легкий.",
    priceCents: 349000,
    imageUrl: "https://placehold.co/800x800/1a1a2e/eee?text=Amstaff",
  },
  {
    id: "prod-kaljan-oduman",
    categoryId: "cat-hookahs",
    name: "Oduman Ignis",
    description: "Кальян з нержавіючої сталі, сучасний дизайн, легке чищення.",
    priceCents: 529000,
    imageUrl: "https://placehold.co/800x800/16213e/eee?text=Oduman",
  },
  {
    id: "prod-kaljan-amy",
    categoryId: "cat-hookahs",
    name: "Amy Deluxe SS-04",
    description: "Німецька якість, сталевий кальян з мінімалістичним дизайном.",
    priceCents: 799000,
    imageUrl: "https://placehold.co/800x800/0f3460/eee?text=Amy+Deluxe",
  },
  {
    id: "prod-kaljan-travel",
    categoryId: "cat-hookahs",
    name: "Кальян міні (для подорожей)",
    description: "Компактний складний кальян, ідеальний для поїздок.",
    priceCents: 189000,
    imageUrl: "https://placehold.co/800x800/1a1a2e/eee?text=Travel",
  },
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
    description: "Солодкий гумовий ведмідь з лимоном. Міцність: легка. Об'єм: 100г.",
    priceCents: 22000,
    imageUrl: "https://placehold.co/800x800/533483/eee?text=Fumari",
  },
  {
    id: "prod-tobacco-darkside",
    categoryId: "cat-tobacco",
    name: "Darkside Cola",
    description: "Тютюн з насиченим смаком коли. Міцність: середня. Об'єм: 200г.",
    priceCents: 28000,
    imageUrl: "https://placehold.co/800x800/e94560/111?text=Darkside",
  },
  {
    id: "prod-tobacco-alfakher",
    categoryId: "cat-tobacco",
    name: "Al Fakher Double Apple",
    description: "Класичний подвійний яблуневий смак. Міцність: середня. Об'єм: 250г.",
    priceCents: 18000,
    imageUrl: "https://placehold.co/800x800/2d6a4f/eee?text=Al+Fakher",
  },
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
    description: "Вугілля з букового дерева, без домішок. Потребує розпалювання.",
    priceCents: 12000,
    imageUrl: "https://placehold.co/800x800/3d3d3d/eee?text=Natural+Coal",
  },
  {
    id: "prod-vape-starter",
    categoryId: "cat-vapes",
    name: "Vaporesso XROS 3",
    description: "Портативний POD-вейп, вбудована батарея 1000 мАг, змінні картриджі.",
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
    description: "Полуниця з тостами та вершковим маслом. Нікотин: 3мг. Об'єм: 100мл.",
    priceCents: 32000,
    imageUrl: "https://placehold.co/800x800/e63946/eee?text=Jam+Monster",
  },
  {
    id: "prod-liquid-candy",
    categoryId: "cat-liquids",
    name: "Yogi Energy",
    description: "Енергетичний напій з манго та гуавою. Нікотин: 6мг. Об'єм: 60мл.",
    priceCents: 28000,
    imageUrl: "https://placehold.co/800x800/fca311/111?text=Yogi",
  },
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
];

const productsById = Object.fromEntries(products.map((product) => [product.id, product]));

const orders = [
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

  for (const customer of customers) {
    await prisma.customer.create({ data: customer });
  }

  for (const order of orders) {
    await prisma.order.create({
      data: {
        id: order.id,
        customerId: order.customerId,
        paymentMethod: order.paymentMethod,
        status: order.status,
        createdAt: order.createdAt,
        totalAmount: money(orderTotalCents(order)),
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
    `Seeded ${categories.length} categories, ${products.length} products, ${customers.length} customers, ${orders.length} orders.`,
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
