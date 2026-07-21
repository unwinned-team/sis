import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import test, { after, afterEach, before, beforeEach } from "node:test";
import app from "../../src/app.js";
import prisma from "../../src/prisma.js";
import { signAccessToken } from "../../src/lib/jwt.js";
import { MAX_CART_LINES } from "../../src/schemas/cart.js";

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
  prefix = `it-${randomUUID()}`;
});

afterEach(async () => {
  // Каскады покрыли бы cartItem, но явная очистка не зависит от порядка ниже.
  await prisma.cartItem.deleteMany({
    where: { customerId: { startsWith: prefix } },
  });
  await prisma.product.deleteMany({ where: { id: { startsWith: prefix } } });
  await prisma.category.deleteMany({ where: { id: { startsWith: prefix } } });
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
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

async function addCustomer(suffix = "") {
  const customer = await prisma.customer.create({
    data: {
      id: `${prefix}${suffix}-customer`,
      name: `${prefix}${suffix} customer`,
      email: `${prefix}${suffix}@example.test`,
    },
  });
  const token = await signAccessToken({ sub: customer.id, role: "CUSTOMER" });
  return { customer, token };
}

async function addProduct(
  suffix = "",
  options: { price?: string; isAvailable?: boolean; isArchived?: boolean } = {},
) {
  const categoryId = `${prefix}${suffix}-category`;
  await prisma.category.create({
    data: {
      id: categoryId,
      name: `${prefix}${suffix} category`,
      slug: `${prefix}${suffix}`,
    },
  });
  return prisma.product.create({
    data: {
      id: `${prefix}${suffix}-product`,
      name: `${prefix}${suffix} product`,
      description: "Integration test product",
      price: options.price ?? "10.00",
      categoryId,
      imageUrl: "https://example.test/product.png",
      isAvailable: options.isAvailable ?? true,
      isArchived: options.isArchived ?? false,
    },
  });
}

async function addVariant(
  productId: string,
  options: { taste?: string; size?: string; price: string },
) {
  return prisma.productVariant.create({
    data: {
      productId,
      taste: options.taste ?? null,
      size: options.size ?? null,
      price: options.price,
    },
  });
}

test("all cart routes require authentication", async () => {
  const results = await Promise.all([
    api("GET", "/cart"),
    api("POST", "/cart/items", { productId: "x" }),
    api("PATCH", "/cart/items/x", { quantity: 1 }),
    api("DELETE", "/cart/items/x"),
    api("DELETE", "/cart"),
  ]);
  for (const result of results) {
    assert.equal(result.status, 401);
  }
});

test("a fresh customer has an empty cart", async () => {
  const { token } = await addCustomer();

  const result = await api("GET", "/cart", undefined, token);

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    items: [],
    totalQuantity: 0,
    totalAmount: "0.00",
  });
});

test("adding a product creates a line with computed totals", async () => {
  const { token } = await addCustomer();
  const product = await addProduct("", { price: "3.25" });

  const result = await api(
    "POST",
    "/cart/items",
    { productId: product.id, quantity: 2 },
    token,
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.items.length, 1);
  const line = result.body.items[0];
  assert.equal(line.productId, product.id);
  assert.equal(line.variantId, null);
  assert.equal(line.quantity, 2);
  assert.equal(line.unitPrice, "3.25");
  assert.equal(line.lineTotal, "6.50");
  assert.equal(line.isAvailable, true);
  assert.equal(result.body.totalQuantity, 2);
  assert.equal(result.body.totalAmount, "6.50");
});

test("adding the same product without a variant merges into one line", async () => {
  const { token } = await addCustomer();
  const product = await addProduct();

  await api("POST", "/cart/items", { productId: product.id, quantity: 1 }, token);
  const result = await api(
    "POST",
    "/cart/items",
    { productId: product.id, quantity: 2 },
    token,
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.items.length, 1);
  assert.equal(result.body.items[0].quantity, 3);
});

test("variants create separate lines with variant prices", async () => {
  const { token } = await addCustomer();
  const product = await addProduct("", { price: "10.00" });
  const variantA = await addVariant(product.id, { taste: "mint", price: "12.00" });
  const variantB = await addVariant(product.id, { taste: "berry", price: "13.50" });

  await api(
    "POST",
    "/cart/items",
    { productId: product.id, variantId: variantA.id },
    token,
  );
  await api(
    "POST",
    "/cart/items",
    { productId: product.id, variantId: variantB.id },
    token,
  );
  const result = await api(
    "POST",
    "/cart/items",
    { productId: product.id, variantId: variantA.id },
    token,
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.items.length, 2);
  const lineA = result.body.items.find((item: any) => item.variantId === variantA.id);
  const lineB = result.body.items.find((item: any) => item.variantId === variantB.id);
  assert.equal(lineA.quantity, 2);
  assert.equal(lineA.unitPrice, "12.00");
  assert.equal(lineB.quantity, 1);
  assert.equal(lineB.unitPrice, "13.50");
  assert.equal(result.body.totalAmount, "37.50");
});

test("a variant belonging to another product returns 404", async () => {
  const { token } = await addCustomer();
  const product = await addProduct("-a");
  const otherProduct = await addProduct("-b");
  const foreignVariant = await addVariant(otherProduct.id, { price: "5.00" });

  const result = await api(
    "POST",
    "/cart/items",
    { productId: product.id, variantId: foreignVariant.id },
    token,
  );

  assert.equal(result.status, 404);
});

test("a product with variants requires a variantId", async () => {
  const { token } = await addCustomer();
  const product = await addProduct();
  await addVariant(product.id, { price: "5.00" });

  const result = await api("POST", "/cart/items", { productId: product.id }, token);

  assert.equal(result.status, 400);
});

test("adding an archived or unavailable product returns 409 with productIds", async () => {
  const { token } = await addCustomer();
  const archived = await addProduct("-archived", { isArchived: true });
  const unavailable = await addProduct("-unavailable", { isAvailable: false });

  for (const product of [archived, unavailable]) {
    const result = await api("POST", "/cart/items", { productId: product.id }, token);
    assert.equal(result.status, 409);
    assert.deepEqual(result.body.details, { productIds: [product.id] });
  }
});

test("adding a missing product returns 404", async () => {
  const { token } = await addCustomer();

  const result = await api(
    "POST",
    "/cart/items",
    { productId: `${prefix}-missing-product` },
    token,
  );

  assert.equal(result.status, 404);
});

test("quantity is clamped at the per-line maximum", async () => {
  const { token } = await addCustomer();
  const product = await addProduct();

  await api("POST", "/cart/items", { productId: product.id, quantity: 999 }, token);
  const result = await api(
    "POST",
    "/cart/items",
    { productId: product.id, quantity: 999 },
    token,
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.items[0].quantity, 999);
});

test("parallel additions cannot exceed the cart line limit", async () => {
  const { customer, token } = await addCustomer();
  const categoryId = `${prefix}-limit-category`;
  const productIds = Array.from(
    { length: MAX_CART_LINES + 1 },
    (_, index) => `${prefix}-limit-product-${index}`,
  );

  await prisma.category.create({
    data: { id: categoryId, name: `${prefix} limit`, slug: `${prefix}-limit` },
  });
  await prisma.product.createMany({
    data: productIds.map((id) => ({
      id,
      name: id,
      description: "Cart limit integration test product",
      price: "1.00",
      categoryId,
      imageUrl: "https://example.test/product.png",
    })),
  });
  await prisma.cartItem.createMany({
    data: productIds.slice(0, MAX_CART_LINES - 1).map((productId) => ({
      customerId: customer.id,
      productId,
      quantity: 1,
    })),
  });

  const results = await Promise.all(
    productIds.slice(MAX_CART_LINES - 1).map((productId) =>
      api("POST", "/cart/items", { productId }, token),
    ),
  );

  assert.deepEqual(
    results.map(({ status }) => status).sort(),
    [200, 409],
  );
  assert.equal(
    await prisma.cartItem.count({ where: { customerId: customer.id } }),
    MAX_CART_LINES,
  );
});

test("PATCH sets the exact quantity", async () => {
  const { token } = await addCustomer();
  const product = await addProduct("", { price: "2.00" });
  const added = await api(
    "POST",
    "/cart/items",
    { productId: product.id, quantity: 5 },
    token,
  );

  const result = await api(
    "PATCH",
    `/cart/items/${added.body.items[0].id}`,
    { quantity: 1 },
    token,
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.items[0].quantity, 1);
  assert.equal(result.body.totalAmount, "2.00");
});

test("PATCH and DELETE on another customer's line return 404", async () => {
  const owner = await addCustomer("-owner");
  const intruder = await addCustomer("-intruder");
  const product = await addProduct();
  const added = await api(
    "POST",
    "/cart/items",
    { productId: product.id, quantity: 2 },
    owner.token,
  );
  const lineId = added.body.items[0].id;

  const patched = await api(
    "PATCH",
    `/cart/items/${lineId}`,
    { quantity: 9 },
    intruder.token,
  );
  const deleted = await api("DELETE", `/cart/items/${lineId}`, undefined, intruder.token);
  const ownerCart = await api("GET", "/cart", undefined, owner.token);
  const intruderCart = await api("GET", "/cart", undefined, intruder.token);

  assert.equal(patched.status, 404);
  assert.equal(deleted.status, 404);
  assert.equal(ownerCart.body.items[0].quantity, 2);
  assert.deepEqual(intruderCart.body.items, []);
});

test("PATCH and DELETE on an unknown line return 404", async () => {
  const { token } = await addCustomer();

  const patched = await api(
    "PATCH",
    `/cart/items/${prefix}-missing-item`,
    { quantity: 1 },
    token,
  );
  const deleted = await api(
    "DELETE",
    `/cart/items/${prefix}-missing-item`,
    undefined,
    token,
  );

  assert.equal(patched.status, 404);
  assert.equal(deleted.status, 404);
});

test("removing a line returns the cart without it", async () => {
  const { token } = await addCustomer();
  const product = await addProduct();
  const added = await api("POST", "/cart/items", { productId: product.id }, token);

  const result = await api(
    "DELETE",
    `/cart/items/${added.body.items[0].id}`,
    undefined,
    token,
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.items, []);
  assert.equal(result.body.totalAmount, "0.00");
});

test("clearing the cart is idempotent", async () => {
  const { token } = await addCustomer();
  const product = await addProduct();
  await api("POST", "/cart/items", { productId: product.id }, token);

  const first = await api("DELETE", "/cart", undefined, token);
  const second = await api("DELETE", "/cart", undefined, token);

  assert.equal(first.status, 200);
  assert.deepEqual(first.body.items, []);
  assert.equal(second.status, 200);
  assert.deepEqual(second.body.items, []);
});

test("a line archived after adding is flagged and excluded from totals", async () => {
  const { token } = await addCustomer();
  const kept = await addProduct("-kept", { price: "4.00" });
  const toArchive = await addProduct("-gone", { price: "6.00" });
  await api("POST", "/cart/items", { productId: kept.id, quantity: 1 }, token);
  await api("POST", "/cart/items", { productId: toArchive.id, quantity: 1 }, token);

  await prisma.product.update({
    where: { id: toArchive.id },
    data: { isArchived: true },
  });
  const result = await api("GET", "/cart", undefined, token);

  assert.equal(result.status, 200);
  assert.equal(result.body.items.length, 2);
  const archivedLine = result.body.items.find(
    (item: any) => item.productId === toArchive.id,
  );
  assert.equal(archivedLine.isAvailable, false);
  assert.equal(result.body.totalQuantity, 1);
  assert.equal(result.body.totalAmount, "4.00");
});

test("deleting a variant cascades its cart line away", async () => {
  const { token } = await addCustomer();
  const product = await addProduct();
  const variant = await addVariant(product.id, { price: "5.00" });
  await api(
    "POST",
    "/cart/items",
    { productId: product.id, variantId: variant.id },
    token,
  );

  await prisma.productVariant.delete({ where: { id: variant.id } });
  const result = await api("GET", "/cart", undefined, token);

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.items, []);
});

test("customers only ever see their own cart", async () => {
  const alice = await addCustomer("-alice");
  const bob = await addCustomer("-bob");
  const product = await addProduct();
  await api("POST", "/cart/items", { productId: product.id }, alice.token);

  const bobCart = await api("GET", "/cart", undefined, bob.token);

  assert.equal(bobCart.status, 200);
  assert.deepEqual(bobCart.body.items, []);
});
