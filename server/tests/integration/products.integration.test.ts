import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import test, { after, afterEach, before, beforeEach } from "node:test";
import app from "../../src/app.js";
import prisma from "../../src/prisma.js";
import { signAccessToken } from "../../src/lib/jwt.js";
import { hashPassword } from "../../src/lib/password.js";

interface ApiResult {
  status: number;
  body: any;
}

let server: Server | undefined;
let baseUrl = "";
let prefix = "";

before(async () => {
  await prisma.$connect();
  server = await new Promise<Server>((resolve, reject) => {
    const started = app.listen(0, "127.0.0.1", () => resolve(started));
    started.once("error", reject);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
});

beforeEach(() => {
  prefix = `it-prod-${randomUUID()}`;
});

afterEach(async () => {
  // Созданные через API продукты получают cuid-id — чистим по префиксу имени.
  await prisma.order.deleteMany({ where: { customer: { id: { startsWith: prefix } } } });
  await prisma.product.deleteMany({
    where: { OR: [{ id: { startsWith: prefix } }, { name: { startsWith: prefix } }] },
  });
  await prisma.category.deleteMany({
    where: { OR: [{ id: { startsWith: prefix } }, { slug: { startsWith: prefix } }] },
  });
  await prisma.customer.deleteMany({ where: { id: { startsWith: prefix } } });
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => (error ? reject(error) : resolve()));
    });
  }
  await prisma.$disconnect();
});

async function api(
  method: string,
  path: string,
  options: { body?: Record<string, unknown>; token?: string } = {},
): Promise<ApiResult> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(options.token === undefined ? {} : { authorization: `Bearer ${options.token}` }),
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function addAdmin() {
  const customer = await prisma.customer.create({
    data: {
      id: `${prefix}-admin`,
      name: `${prefix} admin`,
      email: `${prefix}-admin@example.test`,
      role: "ADMIN",
      passwordHash: await hashPassword("admin-password-123"),
    },
  });
  return signAccessToken({ sub: customer.id, role: "ADMIN" });
}

async function addCategory(suffix: string) {
  return prisma.category.create({
    data: { id: `${prefix}-${suffix}`, name: `${prefix} ${suffix}`, slug: `${prefix}-${suffix}` },
  });
}

async function addProduct(suffix: string, categoryId: string, name?: string) {
  return prisma.product.create({
    data: {
      id: `${prefix}-${suffix}`,
      name: name ?? `${prefix} ${suffix}`,
      description: "integration fixture",
      price: "10.00",
      categoryId,
      imageUrl: "https://example.test/product.png",
    },
  });
}

function createBody(categoryId: string, overrides: Record<string, unknown> = {}) {
  return {
    name: `${prefix} created`,
    description: "created via API",
    price: 12.5,
    categoryId,
    imageUrl: "https://example.test/created.png",
    ...overrides,
  };
}

test("product list is public, sorted by name and filterable by category", async () => {
  const catA = await addCategory("a");
  const catB = await addCategory("b");
  await addProduct("z", catA.id, `${prefix} zeta`);
  await addProduct("m", catB.id, `${prefix} middle`);
  await addProduct("a", catA.id, `${prefix} alpha`);

  const all = await api("GET", "/products");
  assert.equal(all.status, 200);
  const ours = all.body.filter((entry: { name: string }) => entry.name.startsWith(prefix));
  assert.deepEqual(
    ours.map((entry: { name: string }) => entry.name),
    [`${prefix} alpha`, `${prefix} middle`, `${prefix} zeta`],
  );
  // Каталогу нужны категория и варианты сразу, без дозапросов.
  assert.equal(ours[0].category.id, catA.id);
  assert.ok(Array.isArray(ours[0].variants));

  const filtered = await api("GET", `/products?categoryId=${catA.id}`);
  assert.equal(filtered.status, 200);
  assert.deepEqual(
    filtered.body.map((entry: { name: string }) => entry.name),
    [`${prefix} alpha`, `${prefix} zeta`],
  );
});

test("product by id includes category and variants; missing id answers 404", async () => {
  const category = await addCategory("one");
  const product = await addProduct("one", category.id);
  await prisma.productVariant.create({
    data: { productId: product.id, taste: "vanilla", size: "500ml", price: "12.00" },
  });

  const found = await api("GET", `/products/${product.id}`);
  assert.equal(found.status, 200);
  assert.equal(found.body.id, product.id);
  assert.equal(found.body.category.slug, category.slug);
  assert.equal(found.body.variants.length, 1);
  assert.equal(found.body.variants[0].taste, "vanilla");

  const missing = await api("GET", `/products/${prefix}-missing`);
  assert.equal(missing.status, 404);
});

test("product mutations require an admin", async () => {
  const category = await addCategory("guard");
  const product = await addProduct("guard", category.id);
  const customer = await prisma.customer.create({
    data: { id: `${prefix}-customer`, name: `${prefix} customer` },
  });
  const customerToken = await signAccessToken({ sub: customer.id, role: "CUSTOMER" });

  for (const [method, path, body] of [
    ["POST", "/products", createBody(category.id)],
    ["PUT", `/products/${product.id}`, { name: `${prefix} hacked` }],
    ["DELETE", `/products/${product.id}`, undefined],
  ] as const) {
    const anonymous = await api(method, path, body ? { body } : {});
    assert.equal(anonymous.status, 401, `${method} ${path} without a token`);

    const asCustomer = await api(method, path, { token: customerToken, ...(body ? { body } : {}) });
    assert.equal(asCustomer.status, 403, `${method} ${path} as a customer`);
  }

  const untouched = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
  assert.equal(untouched.name, `${prefix} guard`);
});

test("admin creates a product in an existing category", async () => {
  const token = await addAdmin();
  const category = await addCategory("create");

  const created = await api("POST", "/products", { token, body: createBody(category.id) });
  assert.equal(created.status, 201);
  assert.equal(created.body.name, `${prefix} created`);
  assert.equal(created.body.category.id, category.id);
  assert.equal(Number(created.body.price), 12.5);

  const persisted = await prisma.product.findUniqueOrThrow({ where: { id: created.body.id } });
  assert.equal(persisted.price.toFixed(2), "12.50");
});

test("product create validates the body with 400", async () => {
  const token = await addAdmin();
  const category = await addCategory("badcreate");

  for (const body of [
    createBody(category.id, { price: 0 }),
    createBody(category.id, { price: -1 }),
    createBody(category.id, { price: 10.001 }),
    createBody(category.id, { price: 100_000_000 }),
    createBody(category.id, { price: "12.50" }),
    createBody(category.id, { imageUrl: "" }),
    createBody(category.id, { name: "" }),
    createBody(category.id, { description: "" }),
  ]) {
    const result = await api("POST", "/products", { token, body });
    assert.equal(result.status, 400, JSON.stringify(body));
  }
  assert.equal(await prisma.product.count({ where: { name: `${prefix} created` } }), 0);
});

test("product create answers 404 for a missing category", async () => {
  const token = await addAdmin();
  const result = await api("POST", "/products", {
    token,
    body: createBody(`${prefix}-no-such-category`),
  });
  assert.equal(result.status, 404);
});

test("admin updates a product partially without touching other fields", async () => {
  const token = await addAdmin();
  const category = await addCategory("upd");
  const target = await addCategory("target");
  const product = await addProduct("upd", category.id);

  const renamed = await api("PUT", `/products/${product.id}`, {
    token,
    body: { name: `${prefix} renamed`, price: 15.75 },
  });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.name, `${prefix} renamed`);
  assert.equal(Number(renamed.body.price), 15.75);
  assert.equal(renamed.body.description, "integration fixture");
  assert.equal(renamed.body.category.id, category.id);

  const moved = await api("PUT", `/products/${product.id}`, {
    token,
    body: { categoryId: target.id },
  });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.category.id, target.id);
});

test("product update answers 404 for a missing product or category and 400 for a bad body", async () => {
  const token = await addAdmin();
  const category = await addCategory("upd404");
  const product = await addProduct("upd404", category.id);

  const missingProduct = await api("PUT", `/products/${prefix}-missing`, {
    token,
    body: { name: `${prefix} whatever` },
  });
  assert.equal(missingProduct.status, 404);

  const missingCategory = await api("PUT", `/products/${product.id}`, {
    token,
    body: { categoryId: `${prefix}-no-such-category` },
  });
  assert.equal(missingCategory.status, 404);

  for (const body of [{ name: "" }, { price: 10.001 }, { imageUrl: "" }]) {
    const result = await api("PUT", `/products/${product.id}`, { token, body });
    assert.equal(result.status, 400, JSON.stringify(body));
  }

  const untouched = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
  assert.equal(untouched.categoryId, category.id);
});

test("admin deletes an unordered product; ordered products are archived", async () => {
  const token = await addAdmin();
  const category = await addCategory("del");
  const free = await addProduct("free", category.id);
  const ordered = await addProduct("ordered", category.id);
  const customer = await prisma.customer.create({
    data: { id: `${prefix}-buyer`, name: `${prefix} buyer` },
  });
  await prisma.order.create({
    data: {
      customerId: customer.id,
      totalAmount: "10.00",
      paymentMethod: "CASH",
      items: { create: [{ productId: ordered.id, quantity: 1, price: "10.00" }] },
    },
  });

  const deleted = await api("DELETE", `/products/${free.id}`, { token });
  assert.equal(deleted.status, 204);
  assert.equal(await prisma.product.count({ where: { id: free.id } }), 0);

  // История заказов важнее каталога: продукт из заказов не удаляется,
  // а архивируется и пропадает из публичной выдачи.
  const archived = await api("DELETE", `/products/${ordered.id}`, { token });
  assert.equal(archived.status, 200);
  assert.equal(archived.body.archived, true);

  const persisted = await prisma.product.findUniqueOrThrow({ where: { id: ordered.id } });
  assert.equal(persisted.isArchived, true);

  const publicRead = await api("GET", `/products/${ordered.id}`);
  assert.equal(publicRead.status, 404);

  const missing = await api("DELETE", `/products/${free.id}`, { token });
  assert.equal(missing.status, 404);
});

test("product search matches words in any order across name and description", async () => {
  const category = await addCategory("search");
  await prisma.product.create({
    data: {
      id: `${prefix}-choco`,
      name: `${prefix} Chocolate Dream`,
      description: "rich cocoa with hazelnut",
      price: "10.00",
      categoryId: category.id,
      imageUrl: "https://example.test/product.png",
    },
  });
  await addProduct("vanilla", category.id, `${prefix} Vanilla Classic`);

  // Слова в любом порядке, регистр не важен.
  const byName = await api("GET", `/products?search=dream+${prefix}+CHOCOLATE`);
  assert.equal(byName.status, 200);
  assert.deepEqual(
    byName.body.map((entry: { name: string }) => entry.name),
    [`${prefix} Chocolate Dream`],
  );

  // Слово из описания тоже матчится.
  const byDescription = await api("GET", `/products?search=hazelnut+${prefix}`);
  assert.equal(byDescription.status, 200);
  assert.equal(byDescription.body.length, 1);
  assert.equal(byDescription.body[0].id, `${prefix}-choco`);
  // Каталогу нужны категория и варианты и в поисковой выдаче.
  assert.equal(byDescription.body[0].category.id, category.id);
  assert.ok(Array.isArray(byDescription.body[0].variants));

  const noMatch = await api("GET", "/products?search=xyzzyqwortlebrix");
  assert.equal(noMatch.status, 200);
  assert.deepEqual(noMatch.body, []);
});

test("product search falls back to trigram fuzzy matching on typos", async () => {
  const category = await addCategory("fuzzy");
  await addProduct("berry", category.id, `${prefix} Strawberry Sundae`);
  await prisma.product.create({
    data: {
      id: `${prefix}-arch`,
      name: `${prefix} Strawberry Supreme`,
      description: "integration fixture",
      price: "10.00",
      categoryId: category.id,
      imageUrl: "https://example.test/product.png",
      isArchived: true,
    },
  });

  // Опечатка: точного вхождения нет, срабатывает pg_trgm-фолбэк.
  const fuzzy = await api("GET", "/products?search=strawbery");
  assert.equal(fuzzy.status, 200);
  const ours = fuzzy.body.filter((entry: { name: string }) => entry.name.startsWith(prefix));
  // Архивный продукт не попадает и в fuzzy-выдачу.
  assert.deepEqual(
    ours.map((entry: { name: string }) => entry.name),
    [`${prefix} Strawberry Sundae`],
  );
});
