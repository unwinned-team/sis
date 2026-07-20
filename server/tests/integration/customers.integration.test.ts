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
  prefix = `it-cust-${randomUUID()}`;
});

afterEach(async () => {
  await prisma.order.deleteMany({
    where: {
      customer: {
        OR: [{ id: { startsWith: prefix } }, { email: { startsWith: prefix } }],
      },
    },
  });
  await prisma.product.deleteMany({ where: { id: { startsWith: prefix } } });
  await prisma.category.deleteMany({ where: { id: { startsWith: prefix } } });
  // Созданные через API клиенты получают cuid-id — чистим по префиксу
  // email/phone/имени.
  await prisma.customer.deleteMany({
    where: {
      OR: [
        { id: { startsWith: prefix } },
        { email: { startsWith: prefix } },
        { name: { startsWith: prefix } },
      ],
    },
  });
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

async function addCustomer(suffix: string, data: Record<string, unknown> = {}) {
  return prisma.customer.create({
    data: {
      id: `${prefix}-${suffix}`,
      name: `${prefix} ${suffix}`,
      ...data,
    },
  });
}

test("the whole customers CRUD is admin-only", async () => {
  const target = await addCustomer("guarded");
  const self = await addCustomer("self");
  const customerToken = await signAccessToken({ sub: self.id, role: "CUSTOMER" });

  for (const [method, path, body] of [
    ["GET", "/customers", undefined],
    ["GET", `/customers/${target.id}`, undefined],
    ["POST", "/customers", { name: `${prefix} walk-in` }],
    ["PUT", `/customers/${target.id}`, { name: `${prefix} hacked` }],
    ["DELETE", `/customers/${target.id}`, undefined],
    ["GET", `/customers/${target.id}/orders`, undefined],
  ] as const) {
    const anonymous = await api(method, path, body ? { body } : {});
    assert.equal(anonymous.status, 401, `${method} ${path} without a token`);

    const asCustomer = await api(method, path, { token: customerToken, ...(body ? { body } : {}) });
    assert.equal(asCustomer.status, 403, `${method} ${path} as a customer`);
  }
});

test("a valid token of a deleted account is rejected", async () => {
  // Аккаунт удалён после выдачи токена: stateless-доверия для админки нет,
  // requireAdmin сверяется с БД на каждый запрос.
  const ghostToken = await signAccessToken({ sub: `${prefix}-deleted`, role: "ADMIN" });

  const result = await api("GET", "/customers", { token: ghostToken });
  assert.equal(result.status, 403);
});

test("customer list and detail never expose password hashes or 2FA secrets", async () => {
  const token = await addAdmin();
  await addCustomer("secret", {
    email: `${prefix}-secret@example.test`,
    passwordHash: await hashPassword("customer-password-1"),
    totpSecret: "JBSWY3DPEHPK3PXP",
  });

  const list = await api("GET", "/customers", { token });
  assert.equal(list.status, 200);
  const ours = list.body.filter((entry: { id: string }) => entry.id.startsWith(prefix));
  assert.ok(ours.length >= 1);
  for (const entry of ours) {
    assert.equal(entry.passwordHash, undefined, `passwordHash leaked for ${entry.id}`);
    assert.equal(entry.totpSecret, undefined, `totpSecret leaked for ${entry.id}`);
  }

  const detail = await api("GET", `/customers/${prefix}-secret`, { token });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.email, `${prefix}-secret@example.test`);
  assert.equal(detail.body.passwordHash, undefined);
  assert.equal(detail.body.totpSecret, undefined);

  const missing = await api("GET", `/customers/${prefix}-missing`, { token });
  assert.equal(missing.status, 404);
});

test("admin creates a walk-in customer with optional contacts", async () => {
  const token = await addAdmin();

  const bare = await api("POST", "/customers", { token, body: { name: `${prefix} walk-in` } });
  assert.equal(bare.status, 201);
  assert.equal(bare.body.name, `${prefix} walk-in`);
  assert.equal(bare.body.email, null);
  assert.equal(bare.body.phone, null);

  const full = await api("POST", "/customers", {
    token,
    body: { name: `${prefix} regular`, email: `${prefix}-reg@example.test`, phone: `+380-${prefix}` },
  });
  assert.equal(full.status, 201);
  assert.equal(full.body.email, `${prefix}-reg@example.test`);
  assert.equal(full.body.phone, `+380-${prefix}`);
});

test("customer create normalizes email and validates input with 400", async () => {
  const token = await addAdmin();

  const normalized = await api("POST", "/customers", {
    token,
    body: { name: `${prefix} shouty`, email: `  ${prefix.toUpperCase()}-SHOUTY@EXAMPLE.TEST  ` },
  });
  assert.equal(normalized.status, 201);
  assert.equal(normalized.body.email, `${prefix}-shouty@example.test`);

  for (const body of [{}, { name: "" }, { name: `${prefix} x`, email: "not-an-email" }]) {
    const result = await api("POST", "/customers", { token, body });
    assert.equal(result.status, 400, JSON.stringify(body));
  }
});

test("admin updates a customer partially; missing id answers 404", async () => {
  const token = await addAdmin();
  const customer = await addCustomer("upd", { email: `${prefix}-upd@example.test` });

  const renamed = await api("PUT", `/customers/${customer.id}`, {
    token,
    body: { phone: `+380-${prefix}-upd` },
  });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.phone, `+380-${prefix}-upd`);
  // Не переданные поля не трогаем.
  assert.equal(renamed.body.name, `${prefix} upd`);
  assert.equal(renamed.body.email, `${prefix}-upd@example.test`);

  const missing = await api("PUT", `/customers/${prefix}-missing`, {
    token,
    body: { name: `${prefix} ghost` },
  });
  assert.equal(missing.status, 404);

  const invalid = await api("PUT", `/customers/${customer.id}`, {
    token,
    body: { email: "not-an-email" },
  });
  assert.equal(invalid.status, 400);
});

test("admin deletes a customer without orders; customers with orders answer 409", async () => {
  const token = await addAdmin();
  const free = await addCustomer("free");
  const buyer = await addCustomer("buyer");
  const category = await prisma.category.create({
    data: { id: `${prefix}-category`, name: `${prefix} category`, slug: `${prefix}-category` },
  });
  const product = await prisma.product.create({
    data: {
      id: `${prefix}-product`,
      name: `${prefix} product`,
      description: "integration fixture",
      price: "10.00",
      categoryId: category.id,
      imageUrl: "https://example.test/product.png",
    },
  });
  await prisma.order.create({
    data: {
      customerId: buyer.id,
      totalAmount: "10.00",
      paymentMethod: "CASH",
      items: { create: [{ productId: product.id, quantity: 1, price: "10.00" }] },
    },
  });

  const deleted = await api("DELETE", `/customers/${free.id}`, { token });
  assert.equal(deleted.status, 204);
  assert.equal(await prisma.customer.count({ where: { id: free.id } }), 0);

  // Клиент с заказами — часть финансовой истории, удалять нельзя.
  const blocked = await api("DELETE", `/customers/${buyer.id}`, { token });
  assert.equal(blocked.status, 409);
  assert.equal(await prisma.customer.count({ where: { id: buyer.id } }), 1);

  const missing = await api("DELETE", `/customers/${free.id}`, { token });
  assert.equal(missing.status, 404);
});

test("customer orders are listed newest first with items and products", async () => {
  const token = await addAdmin();
  const buyer = await addCustomer("history");
  const category = await prisma.category.create({
    data: { id: `${prefix}-hcategory`, name: `${prefix} category`, slug: `${prefix}-hcategory` },
  });
  const product = await prisma.product.create({
    data: {
      id: `${prefix}-hproduct`,
      name: `${prefix} product`,
      description: "integration fixture",
      price: "10.00",
      categoryId: category.id,
      imageUrl: "https://example.test/product.png",
    },
  });
  const older = await prisma.order.create({
    data: {
      customerId: buyer.id,
      totalAmount: "10.00",
      paymentMethod: "CASH",
      createdAt: new Date("2026-01-01T10:00:00Z"),
      items: { create: [{ productId: product.id, quantity: 1, price: "10.00" }] },
    },
  });
  const newer = await prisma.order.create({
    data: {
      customerId: buyer.id,
      totalAmount: "20.00",
      paymentMethod: "CARD",
      createdAt: new Date("2026-02-01T10:00:00Z"),
      items: { create: [{ productId: product.id, quantity: 2, price: "10.00" }] },
    },
  });

  const result = await api("GET", `/customers/${buyer.id}/orders`, { token });
  assert.equal(result.status, 200);
  assert.deepEqual(
    result.body.map((order: { id: string }) => order.id),
    [newer.id, older.id],
  );
  assert.equal(result.body[0].items[0].product.id, product.id);

  const missing = await api("GET", `/customers/${prefix}-missing/orders`, { token });
  assert.equal(missing.status, 404);

  const empty = await api("GET", `/customers/${prefix}-admin/orders`, { token });
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body, []);
});
