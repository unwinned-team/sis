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
  // randomUUID даёт slug-совместимый префикс (строчные буквы, цифры, дефисы).
  prefix = `it-cat-${randomUUID()}`;
});

afterEach(async () => {
  await prisma.order.deleteMany({
    where: { customer: { id: { startsWith: prefix } } },
  });
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
  options: { body?: Record<string, unknown> | null; token?: string } = {},
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

async function addCustomerToken() {
  const customer = await prisma.customer.create({
    data: { id: `${prefix}-customer`, name: `${prefix} customer` },
  });
  return signAccessToken({ sub: customer.id, role: "CUSTOMER" });
}

async function addCategory(suffix: string, name?: string) {
  return prisma.category.create({
    data: {
      id: `${prefix}-${suffix}`,
      name: name ?? `${prefix} ${suffix}`,
      slug: `${prefix}-${suffix}`,
    },
  });
}

test("category list is public and sorted by name", async () => {
  await addCategory("b", `${prefix} zeta`);
  await addCategory("a", `${prefix} alpha`);

  const result = await api("GET", "/categories");
  assert.equal(result.status, 200);

  const ours = result.body.filter((entry: { slug: string }) => entry.slug.startsWith(prefix));
  assert.deepEqual(
    ours.map((entry: { name: string }) => entry.name),
    [`${prefix} alpha`, `${prefix} zeta`],
  );
  // Публичный список отдаёт только каталожные поля.
  assert.deepEqual(Object.keys(ours[0]).sort(), ["id", "imageUrl", "name", "slug"]);
});

test("popular product is the one with the highest ordered quantity in the category", async () => {
  const category = await addCategory("pop");
  const other = await addCategory("other");
  const customer = await prisma.customer.create({
    data: { id: `${prefix}-buyer`, name: `${prefix} buyer` },
  });

  const [winner, loser, foreign] = await Promise.all(
    [
      { suffix: "winner", categoryId: category.id },
      { suffix: "loser", categoryId: category.id },
      { suffix: "foreign", categoryId: other.id },
    ].map(({ suffix, categoryId }) =>
      prisma.product.create({
        data: {
          id: `${prefix}-${suffix}`,
          name: `${prefix} ${suffix}`,
          description: "integration fixture",
          price: "10.00",
          categoryId,
          imageUrl: "https://example.test/product.png",
        },
      }),
    ),
  );

  // Победитель набирает 2+4=6 по двум заказам, проигравший 5 в одном заказе.
  // Продукт чужой категории заказан больше всех и не должен влиять.
  await prisma.order.create({
    data: {
      customerId: customer.id,
      totalAmount: "70.00",
      paymentMethod: "CASH",
      items: {
        create: [
          { productId: winner!.id, quantity: 2, price: "10.00" },
          { productId: loser!.id, quantity: 5, price: "10.00" },
        ],
      },
    },
  });
  await prisma.order.create({
    data: {
      customerId: customer.id,
      totalAmount: "140.00",
      paymentMethod: "CASH",
      items: {
        create: [
          { productId: winner!.id, quantity: 4, price: "10.00" },
          { productId: foreign!.id, quantity: 10, price: "10.00" },
        ],
      },
    },
  });

  const result = await api("GET", `/categories/${category.slug}/popular-product`);
  assert.equal(result.status, 200);
  assert.equal(result.body.id, winner!.id);
  assert.equal(result.body.category.id, category.id);
  assert.ok(Array.isArray(result.body.variants));
});

test("popular product answers 404 for a missing category and a category without orders", async () => {
  const empty = await addCategory("empty");

  const missing = await api("GET", `/categories/${prefix}-nope/popular-product`);
  assert.equal(missing.status, 404);

  const noOrders = await api("GET", `/categories/${empty.slug}/popular-product`);
  assert.equal(noOrders.status, 404);
});

test("popular product rejects a malformed slug with 400", async () => {
  const result = await api("GET", "/categories/Bad_Slug/popular-product");
  assert.equal(result.status, 400);
});

test("category mutations require an admin", async () => {
  const customerToken = await addCustomerToken();
  const body = { name: `${prefix} new`, slug: `${prefix}-new` };

  for (const [method, path] of [
    ["POST", "/categories"],
    ["PUT", `/categories/${prefix}-new`],
    ["DELETE", `/categories/${prefix}-new`],
  ] as const) {
    const anonymous = await api(method, path, { body });
    assert.equal(anonymous.status, 401, `${method} ${path} without a token`);

    const asCustomer = await api(method, path, { body, token: customerToken });
    assert.equal(asCustomer.status, 403, `${method} ${path} as a customer`);
  }
  assert.equal(await prisma.category.count({ where: { slug: `${prefix}-new` } }), 0);
});

test("admin creates a category; imageUrl is optional and defaults to null", async () => {
  const token = await addAdmin();

  const created = await api("POST", "/categories", {
    token,
    body: { name: `${prefix} gelato`, slug: `${prefix}-gelato` },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.name, `${prefix} gelato`);
  assert.equal(created.body.slug, `${prefix}-gelato`);
  assert.equal(created.body.imageUrl, null);

  const withImage = await api("POST", "/categories", {
    token,
    body: { name: `${prefix} sorbet`, slug: `${prefix}-sorbet`, imageUrl: "/uploads/sorbet.png" },
  });
  assert.equal(withImage.status, 201);
  assert.equal(withImage.body.imageUrl, "/uploads/sorbet.png");
});

test("category create rejects an invalid slug or empty name with 400", async () => {
  const token = await addAdmin();

  for (const body of [
    { name: `${prefix} x`, slug: "Bad Slug" },
    { name: `${prefix} x`, slug: `-${prefix}` },
    { name: "", slug: `${prefix}-x` },
    { slug: `${prefix}-x` },
  ]) {
    const result = await api("POST", "/categories", { token, body });
    assert.equal(result.status, 400, JSON.stringify(body));
  }
});

test("duplicate slug answers 409 on create and update", async () => {
  const token = await addAdmin();
  await addCategory("taken");
  const second = await addCategory("second");

  const created = await api("POST", "/categories", {
    token,
    body: { name: `${prefix} dup`, slug: `${prefix}-taken` },
  });
  assert.equal(created.status, 409);

  const updated = await api("PUT", `/categories/${second.slug}`, {
    token,
    body: { slug: `${prefix}-taken` },
  });
  assert.equal(updated.status, 409);
});

test("admin updates a category partially; null imageUrl clears the image", async () => {
  const token = await addAdmin();
  const category = await prisma.category.create({
    data: {
      id: `${prefix}-upd`,
      name: `${prefix} original`,
      slug: `${prefix}-upd`,
      imageUrl: "/uploads/original.png",
    },
  });

  const renamed = await api("PUT", `/categories/${category.slug}`, {
    token,
    body: { name: `${prefix} renamed` },
  });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.name, `${prefix} renamed`);
  // Не переданные поля не трогаем.
  assert.equal(renamed.body.slug, category.slug);
  assert.equal(renamed.body.imageUrl, "/uploads/original.png");

  const cleared = await api("PUT", `/categories/${category.slug}`, {
    token,
    body: { imageUrl: null },
  });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.imageUrl, null);

  const reslugged = await api("PUT", `/categories/${category.slug}`, {
    token,
    body: { slug: `${prefix}-moved` },
  });
  assert.equal(reslugged.status, 200);
  assert.equal(reslugged.body.slug, `${prefix}-moved`);
});

test("updating a missing category answers 404", async () => {
  const token = await addAdmin();
  const result = await api("PUT", `/categories/${prefix}-missing`, {
    token,
    body: { name: `${prefix} whatever` },
  });
  assert.equal(result.status, 404);
});

test("category update rejects an invalid body with 400", async () => {
  const token = await addAdmin();
  const category = await addCategory("badupd");

  for (const body of [{ slug: "Bad Slug" }, { name: "" }]) {
    const result = await api("PUT", `/categories/${category.slug}`, { token, body });
    assert.equal(result.status, 400, JSON.stringify(body));
  }
});

test("admin deletes an empty category; a category with products answers 409", async () => {
  const token = await addAdmin();
  const empty = await addCategory("del");
  const occupied = await addCategory("occupied");
  await prisma.product.create({
    data: {
      id: `${prefix}-blocker`,
      name: `${prefix} blocker`,
      description: "integration fixture",
      price: "10.00",
      categoryId: occupied.id,
      imageUrl: "https://example.test/product.png",
    },
  });

  const deleted = await api("DELETE", `/categories/${empty.slug}`);
  assert.equal(deleted.status, 401);

  const asAdmin = await api("DELETE", `/categories/${empty.slug}`, { token });
  assert.equal(asAdmin.status, 204);
  assert.equal(await prisma.category.count({ where: { id: empty.id } }), 0);

  const blocked = await api("DELETE", `/categories/${occupied.slug}`, { token });
  assert.equal(blocked.status, 409);
  assert.equal(await prisma.category.count({ where: { id: occupied.id } }), 1);

  const missing = await api("DELETE", `/categories/${empty.slug}`, { token });
  assert.equal(missing.status, 404);
});
