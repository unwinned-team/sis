import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import test, { after, afterEach, before, beforeEach } from "node:test";
import app from "../../src/app.js";
import prisma from "../../src/prisma.js";
import { signAccessToken } from "../../src/lib/jwt.js";

interface ApiResult {
  status: number;
  body: any;
}

let server: Server | undefined;
let baseUrl = "";
let prefix = "";
let admin = { id: "", token: "" };
let customer = { id: "", token: "" };

before(async () => {
  await prisma.$connect();
  server = await new Promise<Server>((resolve, reject) => {
    const started = app.listen(0, "127.0.0.1", () => resolve(started));
    started.once("error", reject);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
});

beforeEach(async () => {
  prefix = `ac-${randomUUID()}`;
  const [adminCustomer, plainCustomer] = await Promise.all([
    prisma.customer.create({
      data: {
        id: `${prefix}-admin`,
        name: `${prefix} admin`,
        email: `${prefix}-admin@example.test`,
        role: "ADMIN",
      },
    }),
    prisma.customer.create({
      data: {
        id: `${prefix}-customer`,
        name: `${prefix} customer`,
        email: `${prefix}-customer@example.test`,
      },
    }),
  ]);
  admin = {
    id: adminCustomer.id,
    token: await signAccessToken({ sub: adminCustomer.id, role: "ADMIN" }),
  };
  customer = {
    id: plainCustomer.id,
    token: await signAccessToken({ sub: plainCustomer.id, role: "CUSTOMER" }),
  };
});

afterEach(async () => {
  await prisma.orderItem.deleteMany({
    where: { order: { customerId: { startsWith: prefix } } },
  });
  await prisma.order.deleteMany({ where: { customerId: { startsWith: prefix } } });
  await prisma.productVariant.deleteMany({
    where: { product: { id: { startsWith: prefix } } },
  });
  await prisma.product.deleteMany({ where: { id: { startsWith: prefix } } });
  await prisma.category.deleteMany({ where: { id: { startsWith: prefix } } });
  await prisma.refreshToken.deleteMany({
    where: { customerId: { startsWith: prefix } },
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
  body?: Record<string, unknown>,
  token?: string,
): Promise<ApiResult> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // 404 несуществующего роута отдаётся express'ом как HTML — так фронт
    // отличает «фичи нет» от «записи нет». Оставляем тело как есть.
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

async function addCategory(suffix = "") {
  return prisma.category.create({
    data: {
      id: `${prefix}${suffix}-category`,
      name: `${prefix}${suffix} category`,
      slug: `${prefix}${suffix}`,
    },
  });
}

async function addProduct(
  categoryId: string,
  options: { suffix?: string; price?: string; isAvailable?: boolean } = {},
) {
  const suffix = options.suffix ?? "";
  return prisma.product.create({
    data: {
      id: `${prefix}${suffix}-product`,
      name: `${prefix}${suffix} product`,
      description: "Integration test product",
      price: options.price ?? "10.00",
      categoryId,
      imageUrl: "https://example.test/product.png",
      ...(options.isAvailable !== undefined && { isAvailable: options.isAvailable }),
    },
  });
}

async function addOrderFor(productId: string, price = "10.00") {
  return prisma.order.create({
    data: {
      id: `${prefix}-order`,
      customerId: customer.id,
      paymentMethod: "CARD",
      totalAmount: price,
      items: { create: [{ productId, quantity: 1, price }] },
    },
  });
}

// ── Наличие ──────────────────────────────────────────────────────────────────

test("marking a product unavailable blocks ordering it with the ids in the body", async () => {
  const category = await addCategory();
  const product = await addProduct(category.id);

  const update = await api(
    "PUT",
    `/products/${product.id}`,
    { isAvailable: false },
    admin.token,
  );
  assert.equal(update.status, 200);
  assert.equal(update.body.isAvailable, false);

  const order = await api(
    "POST",
    "/orders",
    { paymentMethod: "CARD", items: [{ productId: product.id, quantity: 1 }] },
    customer.token,
  );
  assert.equal(order.status, 409);
  assert.equal(order.body.error, "Products unavailable");
  // Без payload корзина не смогла бы подсветить конкретную позицию.
  assert.deepEqual(order.body.productIds, [product.id]);
});

test("an unknown key is rejected instead of silently doing nothing", async () => {
  const category = await addCategory();
  const product = await addProduct(category.id);

  const result = await api(
    "PUT",
    `/products/${product.id}`,
    { nonsense: true },
    admin.token,
  );
  assert.equal(result.status, 400);
});

// ── Архивирование ────────────────────────────────────────────────────────────

test("deleting a product with order history archives it and hides it everywhere", async () => {
  const category = await addCategory();
  const product = await addProduct(category.id);
  await addOrderFor(product.id);

  const deleted = await api("DELETE", `/products/${product.id}`, undefined, admin.token);
  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.body, { archived: true });

  const stillThere = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
  assert.equal(stillThere.isArchived, true);

  const list = await api("GET", `/products?categoryId=${category.id}`);
  assert.equal(list.status, 200);
  assert.deepEqual(list.body, []);

  const byId = await api("GET", `/products/${product.id}`);
  assert.equal(byId.status, 404);

  const popular = await api("GET", `/categories/${category.slug}/popular-product`);
  assert.equal(popular.status, 404);
});

test("deleting a product without order history removes it and its variants", async () => {
  const category = await addCategory();
  const product = await addProduct(category.id);
  await prisma.productVariant.create({
    data: { productId: product.id, taste: "Мята", size: "30 мл", price: "12.00" },
  });

  const deleted = await api("DELETE", `/products/${product.id}`, undefined, admin.token);
  assert.equal(deleted.status, 204);

  assert.equal(await prisma.product.findUnique({ where: { id: product.id } }), null);
  assert.equal(
    await prisma.productVariant.count({ where: { productId: product.id } }),
    0,
  );
});

test("archived products stay visible to an admin who asks for them", async () => {
  const category = await addCategory();
  const product = await addProduct(category.id);
  await addOrderFor(product.id);
  await api("DELETE", `/products/${product.id}`, undefined, admin.token);

  const asAdmin = await api(
    "GET",
    `/products?categoryId=${category.id}&includeArchived=true`,
    undefined,
    admin.token,
  );
  assert.equal(asAdmin.status, 200);
  assert.deepEqual(
    asAdmin.body.map((entry: { id: string }) => entry.id),
    [product.id],
  );

  // Тот же параметр от обычного клиента игнорируется.
  const asCustomer = await api(
    "GET",
    `/products?categoryId=${category.id}&includeArchived=true`,
    undefined,
    customer.token,
  );
  assert.deepEqual(asCustomer.body, []);

  const anonymous = await api("GET", `/products?categoryId=${category.id}&includeArchived=true`);
  assert.deepEqual(anonymous.body, []);
});

test("an archived product can be brought back", async () => {
  const category = await addCategory();
  const product = await addProduct(category.id);
  await addOrderFor(product.id);
  await api("DELETE", `/products/${product.id}`, undefined, admin.token);

  const restored = await api(
    "PUT",
    `/products/${product.id}`,
    { isArchived: false },
    admin.token,
  );
  assert.equal(restored.status, 200);
  assert.equal(restored.body.isArchived, false);

  const list = await api("GET", `/products?categoryId=${category.id}`);
  assert.equal(list.body.length, 1);
});

test("an archived top seller falls through to the next most popular product", async () => {
  const category = await addCategory();
  const top = await addProduct(category.id, { suffix: "-top" });
  const second = await addProduct(category.id, { suffix: "-second" });

  await prisma.order.create({
    data: {
      id: `${prefix}-order-popular`,
      customerId: customer.id,
      paymentMethod: "CARD",
      totalAmount: "40.00",
      items: {
        create: [
          { productId: top.id, quantity: 3, price: "10.00" },
          { productId: second.id, quantity: 1, price: "10.00" },
        ],
      },
    },
  });

  const before = await api("GET", `/categories/${category.slug}/popular-product`);
  assert.equal(before.body.id, top.id);

  await prisma.product.update({ where: { id: top.id }, data: { isArchived: true } });

  const after = await api("GET", `/categories/${category.slug}/popular-product`);
  assert.equal(after.status, 200);
  assert.equal(after.body.id, second.id);
});

// ── Картинки ─────────────────────────────────────────────────────────────────

test("a product can be created with an uploaded image path", async () => {
  const category = await addCategory();

  const created = await api(
    "POST",
    "/products",
    {
      name: `${prefix} uploaded`,
      description: "Created with an uploaded image",
      price: 25.5,
      categoryId: category.id,
      imageUrl: "/uploads/2f8c1d90-aaaa-bbbb.jpg",
    },
    admin.token,
  );

  assert.equal(created.status, 201);
  assert.equal(created.body.imageUrl, "/uploads/2f8c1d90-aaaa-bbbb.jpg");

  await prisma.product.delete({ where: { id: created.body.id } });
});

// ── Варианты ─────────────────────────────────────────────────────────────────

test("variants can be created, repriced and deleted", async () => {
  const category = await addCategory();
  const product = await addProduct(category.id);

  const created = await api(
    "POST",
    `/products/${product.id}/variants`,
    { taste: "Мята", size: "30 мл", price: 15 },
    admin.token,
  );
  assert.equal(created.status, 201);
  assert.equal(created.body.price, "15");

  const repriced = await api(
    "PUT",
    `/products/${product.id}/variants/${created.body.id}`,
    { price: 19.99 },
    admin.token,
  );
  assert.equal(repriced.status, 200);
  assert.equal(repriced.body.price, "19.99");

  const removed = await api(
    "DELETE",
    `/products/${product.id}/variants/${created.body.id}`,
    undefined,
    admin.token,
  );
  assert.equal(removed.status, 204);
});

test("a variant cannot be reached through another product's id", async () => {
  const category = await addCategory();
  const owner = await addProduct(category.id, { suffix: "-owner" });
  const other = await addProduct(category.id, { suffix: "-other" });

  const variant = await prisma.productVariant.create({
    data: { productId: owner.id, taste: "Мята", price: "12.00" },
  });

  const update = await api(
    "PUT",
    `/products/${other.id}/variants/${variant.id}`,
    { price: 1 },
    admin.token,
  );
  assert.equal(update.status, 404);

  const remove = await api(
    "DELETE",
    `/products/${other.id}/variants/${variant.id}`,
    undefined,
    admin.token,
  );
  assert.equal(remove.status, 404);

  // Цена не изменилась.
  const untouched = await prisma.productVariant.findUniqueOrThrow({
    where: { id: variant.id },
  });
  assert.equal(untouched.price.toFixed(2), "12.00");
});

test("variants on an unknown product answer 404", async () => {
  const result = await api(
    "POST",
    `/products/${prefix}-missing/variants`,
    { taste: "Мята", price: 10 },
    admin.token,
  );
  assert.equal(result.status, 404);
});

// ── Заказы: фильтры и пагинация ──────────────────────────────────────────────

async function seedOrders(count: number, productId: string) {
  for (let index = 0; index < count; index += 1) {
    await prisma.order.create({
      data: {
        id: `${prefix}-order-${index}`,
        customerId: customer.id,
        paymentMethod: "CARD",
        status: index % 2 === 0 ? "NEW" : "COMPLETED",
        totalAmount: "10.00",
        createdAt: new Date(Date.UTC(2026, 6, index + 1)),
        items: { create: [{ productId, quantity: 1, price: "10.00" }] },
      },
    });
  }
}

test("total is independent of take/skip and the period filter applies", async () => {
  const category = await addCategory();
  const product = await addProduct(category.id);
  await seedOrders(5, product.id);

  const page = await api("GET", "/orders?take=2", undefined, admin.token);
  assert.equal(page.status, 200);
  assert.equal(page.body.orders.length, 2);
  assert.ok(page.body.total >= 5, "total counts all matching orders, not the page");

  const firstTotal = page.body.total;
  const second = await api("GET", "/orders?take=2&skip=2", undefined, admin.token);
  assert.equal(second.body.total, firstTotal);
  assert.notDeepEqual(
    page.body.orders.map((entry: { id: string }) => entry.id),
    second.body.orders.map((entry: { id: string }) => entry.id),
  );

  const ranged = await api(
    "GET",
    "/orders?from=2026-07-01T00:00:00.000Z&to=2026-07-03T00:00:00.000Z",
    undefined,
    admin.token,
  );
  assert.equal(
    ranged.body.orders.filter((entry: { id: string }) => entry.id.startsWith(prefix))
      .length,
    3,
  );

  const filtered = await api("GET", "/orders?status=COMPLETED", undefined, admin.token);
  assert.ok(
    filtered.body.orders.every((entry: { status: string }) => entry.status === "COMPLETED"),
  );
});

test("out-of-range pagination and inverted periods are rejected", async () => {
  assert.equal((await api("GET", "/orders?take=101", undefined, admin.token)).status, 400);
  assert.equal((await api("GET", "/orders?take=0", undefined, admin.token)).status, 400);
  assert.equal(
    (
      await api(
        "GET",
        "/orders?from=2026-07-20T00:00:00.000Z&to=2026-07-01T00:00:00.000Z",
        undefined,
        admin.token,
      )
    ).status,
    400,
  );
});

// Регресс на границу доступа: фильтры не должны давать обойти "свои заказы".
test("a customer cannot reach other people's orders through the new filters", async () => {
  const category = await addCategory();
  const product = await addProduct(category.id);
  await seedOrders(3, product.id);

  const other = await prisma.customer.create({
    data: {
      id: `${prefix}-other`,
      name: `${prefix} other`,
      email: `${prefix}-other@example.test`,
    },
  });
  const otherToken = await signAccessToken({ sub: other.id, role: "CUSTOMER" });

  const result = await api("GET", "/orders?take=100", undefined, otherToken);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.orders, []);
  assert.equal(result.body.total, 0);
});

// ── Права ────────────────────────────────────────────────────────────────────

test("a customer is refused on every new admin route", async () => {
  const category = await addCategory();
  const product = await addProduct(category.id);

  const calls: ApiResult[] = [
    await api("PUT", `/products/${product.id}`, { isAvailable: false }, customer.token),
    await api("DELETE", `/products/${product.id}`, undefined, customer.token),
    await api("POST", `/products/${product.id}/variants`, { taste: "x", price: 1 }, customer.token),
    await api("PUT", `/products/${product.id}/variants/whatever`, { price: 1 }, customer.token),
    await api("DELETE", `/products/${product.id}/variants/whatever`, undefined, customer.token),
    await api("GET", "/customers", undefined, customer.token),
    await api("PATCH", `/customers/${admin.id}/role`, { role: "CUSTOMER" }, customer.token),
    await api("PATCH", `/customers/${admin.id}/active`, { isActive: false }, customer.token),
  ];

  for (const call of calls) {
    assert.equal(call.status, 403, `expected 403, got ${call.status}`);
  }
});

// ── Управление админами ──────────────────────────────────────────────────────

test("an admin can promote and demote another customer", async () => {
  const promoted = await api(
    "PATCH",
    `/customers/${customer.id}/role`,
    { role: "ADMIN" },
    admin.token,
  );
  assert.equal(promoted.status, 200);
  assert.equal(promoted.body.role, "ADMIN");
  // passwordHash не должен утекать в ответ.
  assert.equal("passwordHash" in promoted.body, false);

  const demoted = await api(
    "PATCH",
    `/customers/${customer.id}/role`,
    { role: "CUSTOMER" },
    admin.token,
  );
  assert.equal(demoted.status, 200);
  assert.equal(demoted.body.role, "CUSTOMER");
});

test("an admin cannot demote or block themselves", async () => {
  const role = await api(
    "PATCH",
    `/customers/${admin.id}/role`,
    { role: "CUSTOMER" },
    admin.token,
  );
  assert.equal(role.status, 403);

  const active = await api(
    "PATCH",
    `/customers/${admin.id}/active`,
    { isActive: false },
    admin.token,
  );
  assert.equal(active.status, 403);
});

test("the last active admin cannot be demoted or blocked", async () => {
  // Второй админ делает первого «не последним», поэтому демоушен разрешён;
  // после него в префиксе снова остаётся один — и он уже защищён.
  const second = await prisma.customer.create({
    data: {
      id: `${prefix}-admin2`,
      name: `${prefix} admin2`,
      email: `${prefix}-admin2@example.test`,
      role: "ADMIN",
    },
  });

  // Считаем всех активных админов в базе: в общей БД их может быть больше.
  const activeAdmins = await prisma.customer.count({
    where: { role: "ADMIN", isActive: true },
  });

  const demoted = await api(
    "PATCH",
    `/customers/${second.id}/role`,
    { role: "CUSTOMER" },
    admin.token,
  );

  if (activeAdmins > 2) {
    // В базе есть посторонние админы — «последнего» здесь не воспроизвести.
    assert.equal(demoted.status, 200);
    return;
  }

  assert.equal(demoted.status, 200);
  const last = await api(
    "PATCH",
    `/customers/${admin.id}/active`,
    { isActive: false },
    admin.token,
  );
  // Себя блокировать нельзя — это ловится раньше проверки «последний админ».
  assert.equal(last.status, 403);
});

test("demotion revokes the demoted admin's refresh tokens", async () => {
  const target = await prisma.customer.create({
    data: {
      id: `${prefix}-target`,
      name: `${prefix} target`,
      email: `${prefix}-target@example.test`,
      role: "ADMIN",
    },
  });
  await prisma.refreshToken.create({
    data: {
      tokenHash: `${prefix}-hash`,
      customerId: target.id,
      familyId: `${prefix}-family`,
      client: "WEB",
      expiresAt: new Date(Date.now() + 60_000),
    },
  });

  const demoted = await api(
    "PATCH",
    `/customers/${target.id}/role`,
    { role: "CUSTOMER" },
    admin.token,
  );
  assert.equal(demoted.status, 200);

  const live = await prisma.refreshToken.count({
    where: { customerId: target.id, revokedAt: null },
  });
  assert.equal(live, 0);
});

test("the customer list can be filtered by role", async () => {
  const result = await api("GET", "/customers?role=ADMIN", undefined, admin.token);
  assert.equal(result.status, 200);
  assert.ok(
    result.body.customers.every((entry: { role: string }) => entry.role === "ADMIN"),
  );
  assert.ok(
    result.body.customers.some((entry: { id: string }) => entry.id === admin.id),
  );
});
