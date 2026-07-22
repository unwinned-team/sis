import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import test, { after, afterEach, before, beforeEach } from "node:test";
import app from "../../src/app.js";
import prisma from "../../src/prisma.js";
import { signAccessToken } from "../../src/lib/jwt.js";

type PaymentMethod = "CARD" | "CASH" | "BONUS";

interface ApiResult {
  status: number;
  body: any;
}

interface Fixture {
  customer: Awaited<ReturnType<typeof addCustomer>>;
  customerToken: string;
  products: Awaited<ReturnType<typeof addCatalog>>;
}

let server: Server | undefined;
let baseUrl = "";
let prefix = "";
let admin = { id: "", token: "" };

async function dropRollbackTrigger() {
  await prisma.$executeRawUnsafe(
    'DROP TRIGGER IF EXISTS "ice_shop_test_fail_order_insert" ON "Order"',
  );
  await prisma.$executeRawUnsafe(
    "DROP FUNCTION IF EXISTS ice_shop_test_fail_order_insert()",
  );
}

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
  prefix = `it-${randomUUID()}`;
  // requireAdmin проверяет роль в БД, поэтому админ существует как запись.
  const adminCustomer = await prisma.customer.create({
    data: {
      id: `${prefix}-admin`,
      name: `${prefix} admin`,
      email: `${prefix}-admin@example.test`,
      role: "ADMIN",
    },
  });
  admin = {
    id: adminCustomer.id,
    token: await signAccessToken({ sub: adminCustomer.id, role: "ADMIN" }),
  };
});

afterEach(async () => {
  await dropRollbackTrigger();
  await prisma.order.deleteMany({
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

async function addCustomer(
  suffix = "",
  options: { bonusBalance?: string; email?: string; phone?: string } = {},
) {
  const id = `${prefix}${suffix}-customer`;
  return prisma.customer.create({
    data: {
      id,
      name: `${prefix}${suffix} customer`,
      email: options.email ?? `${prefix}${suffix}@example.test`,
      phone: options.phone ?? `${prefix}${suffix}-phone`,
      bonusBalance: options.bonusBalance ?? "0.00",
    },
  });
}

async function addCatalog(suffix = "", prices = ["10.00"]) {
  const categoryId = `${prefix}${suffix}-category`;
  await prisma.category.create({
    data: {
      id: categoryId,
      name: `${prefix}${suffix} category`,
      slug: `${prefix}${suffix}`,
    },
  });

  return Promise.all(
    prices.map((price, index) =>
      prisma.product.create({
        data: {
          id: `${prefix}${suffix}-product-${index + 1}`,
          name: `${prefix}${suffix} product ${index + 1}`,
          description: "Integration test product",
          price,
          categoryId,
          imageUrl: "https://example.test/product.png",
        },
      }),
    ),
  );
}

async function addFixture(
  options: {
    suffix?: string;
    bonusBalance?: string;
    prices?: string[];
  } = {},
): Promise<Fixture> {
  const suffix = options.suffix ?? "";
  const [customer, products] = await Promise.all([
    addCustomer(
      suffix,
      options.bonusBalance === undefined
        ? {}
        : { bonusBalance: options.bonusBalance },
    ),
    addCatalog(suffix, options.prices),
  ]);
  const customerToken = await signAccessToken({ sub: customer.id, role: "CUSTOMER" });
  return { customer, customerToken, products };
}

function orderItems(fixture: Fixture, quantities?: number[]) {
  return fixture.products.map((product, index) => ({
    productId: product.id,
    quantity: quantities?.[index] ?? 1,
  }));
}

// Заказ оформляется владельцем: customerId сервер берёт из токена.
const delivery = {
  deliveryCity: "Київ",
  deliveryRegion: "Київська",
  deliveryBranch: "42",
};

function postOrder(
  fixture: Fixture,
  paymentMethod: PaymentMethod,
  quantities?: number[],
) {
  return api(
    "POST",
    "/orders",
    { paymentMethod, items: orderItems(fixture, quantities), ...delivery },
    fixture.customerToken,
  );
}

async function expectBalance(customerId: string, expected: string) {
  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: customerId },
  });
  assert.equal(customer.bonusBalance.toFixed(2), expected);
}

test("BONUS order debits the full amount when balance is sufficient", async () => {
  const fixture = await addFixture({ bonusBalance: "10.00", prices: ["3.25"] });

  const result = await postOrder(fixture, "BONUS", [2]);

  assert.equal(result.status, 201);
  assert.equal(result.body.totalAmount, "6.5");
  await expectBalance(fixture.customer.id, "3.50");
});

test("order stores and returns delivery fields", async () => {
  const fixture = await addFixture({ suffix: "-delivery" });

  const created = await postOrder(fixture, "CARD");
  assert.equal(created.status, 201);
  assert.equal(created.body.deliveryCity, delivery.deliveryCity);
  assert.equal(created.body.deliveryRegion, delivery.deliveryRegion);
  assert.equal(created.body.deliveryBranch, delivery.deliveryBranch);

  const fetched = await api("GET", `/orders/${created.body.id}`, undefined, admin.token);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.deliveryCity, delivery.deliveryCity);
  assert.equal(fetched.body.deliveryBranch, delivery.deliveryBranch);
});

test("order without delivery fields returns 400", async () => {
  const fixture = await addFixture({ suffix: "-no-delivery" });

  const result = await api(
    "POST",
    "/orders",
    { paymentMethod: "CARD", items: orderItems(fixture) },
    fixture.customerToken,
  );

  assert.equal(result.status, 400);
});

test("BONUS order returns 409 without changes when balance is insufficient", async () => {
  const fixture = await addFixture({ bonusBalance: "5.00", prices: ["5.01"] });

  const result = await postOrder(fixture, "BONUS");

  assert.equal(result.status, 409);
  assert.equal(
    await prisma.order.count({ where: { customerId: fixture.customer.id } }),
    0,
  );
  await expectBalance(fixture.customer.id, "5.00");
});

test("concurrent BONUS orders cannot spend the same balance twice", async () => {
  const fixture = await addFixture({ bonusBalance: "10.00", prices: ["10.00"] });

  const results = await Promise.all([
    postOrder(fixture, "BONUS"),
    postOrder(fixture, "BONUS"),
  ]);

  assert.deepEqual(
    results.map((result) => result.status).sort(),
    [201, 409],
  );
  assert.equal(
    await prisma.order.count({ where: { customerId: fixture.customer.id } }),
    1,
  );
  await expectBalance(fixture.customer.id, "0.00");
});

test("CARD and CASH orders award exactly 1% on first completion", async () => {
  for (const paymentMethod of ["CARD", "CASH"] as const) {
    const fixture = await addFixture({
      suffix: `-${paymentMethod.toLowerCase()}`,
      prices: ["100.00"],
    });
    const created = await postOrder(fixture, paymentMethod);
    assert.equal(created.status, 201);

    const completed = await api(
      "PUT",
      `/orders/${created.body.id}`,
      { status: "COMPLETED" },
      admin.token,
    );

    assert.equal(completed.status, 200);
    assert.equal(completed.body.paymentStatus, "PAID");
    assert.equal(completed.body.paymentAmountKey, null);
    assert.equal(completed.body.nextCheckAt, null);
    await expectBalance(fixture.customer.id, "1.00");
  }
});

test("CARD payment verification is scheduled and cancellation releases its amount", async () => {
  const fixture = await addFixture({ suffix: "-payment-cancel" });
  const created = await postOrder(fixture, "CARD");

  assert.equal(created.status, 201);
  assert.equal(created.body.paymentStatus, "PENDING");
  assert.ok(created.body.nextCheckAt);
  assert.ok(created.body.paymentAmountKey);

  const cancelled = await api(
    "PUT",
    `/orders/${created.body.id}`,
    { status: "CANCELLED" },
    admin.token,
  );

  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.paymentStatus, "FAILED");
  assert.equal(cancelled.body.paymentAmountKey, null);
  assert.equal(cancelled.body.nextCheckAt, null);
});

test("repeated COMPLETED does not award a bonus twice", async () => {
  const fixture = await addFixture({ prices: ["100.00"] });
  const created = await postOrder(fixture, "CARD");

  const first = await api(
    "PUT",
    `/orders/${created.body.id}`,
    { status: "COMPLETED" },
    admin.token,
  );
  const second = await api(
    "PUT",
    `/orders/${created.body.id}`,
    { status: "COMPLETED" },
    admin.token,
  );

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  await expectBalance(fixture.customer.id, "1.00");
});

test("completing a BONUS order does not award 1%", async () => {
  const fixture = await addFixture({ bonusBalance: "200.00", prices: ["100.00"] });
  const created = await postOrder(fixture, "BONUS");

  const completed = await api(
    "PUT",
    `/orders/${created.body.id}`,
    { status: "COMPLETED" },
    admin.token,
  );

  assert.equal(completed.status, 200);
  await expectBalance(fixture.customer.id, "100.00");
});

test("deleting a NEW BONUS order refunds the full amount", async () => {
  const fixture = await addFixture({ bonusBalance: "100.00", prices: ["25.00"] });
  const created = await postOrder(fixture, "BONUS");
  await expectBalance(fixture.customer.id, "75.00");

  const deleted = await api(
    "DELETE",
    `/orders/${created.body.id}`,
    undefined,
    fixture.customerToken,
  );

  assert.equal(deleted.status, 204);
  assert.equal(
    await prisma.order.count({ where: { id: created.body.id } }),
    0,
  );
  await expectBalance(fixture.customer.id, "100.00");
});

test("deleting PROCESSING or COMPLETED orders returns 409 and keeps them", async () => {
  for (const status of ["PROCESSING", "COMPLETED"] as const) {
    const fixture = await addFixture({
      suffix: `-${status.toLowerCase()}`,
      prices: ["10.00"],
    });
    const created = await postOrder(fixture, "CARD");
    const updated = await api(
      "PUT",
      `/orders/${created.body.id}`,
      { status },
      admin.token,
    );
    assert.equal(updated.status, 200);

    const deleted = await api(
      "DELETE",
      `/orders/${created.body.id}`,
      undefined,
      fixture.customerToken,
    );

    assert.equal(deleted.status, 409);
    const saved = await prisma.order.findUnique({ where: { id: created.body.id } });
    assert.equal(saved?.status, status);
  }
});

test("concurrent completion and deletion produce one valid final state", async () => {
  const fixture = await addFixture({ bonusBalance: "50.00", prices: ["50.00"] });
  const created = await postOrder(fixture, "BONUS");

  const [completed, deleted] = await Promise.all([
    api("PUT", `/orders/${created.body.id}`, { status: "COMPLETED" }, admin.token),
    api("DELETE", `/orders/${created.body.id}`, undefined, fixture.customerToken),
  ]);
  const saved = await prisma.order.findUnique({ where: { id: created.body.id } });

  if (saved) {
    assert.deepEqual([completed.status, deleted.status], [200, 409]);
    assert.equal(saved.status, "COMPLETED");
    await expectBalance(fixture.customer.id, "0.00");
  } else {
    assert.deepEqual([completed.status, deleted.status], [404, 204]);
    await expectBalance(fixture.customer.id, "50.00");
  }
});

test("money calculation avoids floating-point errors", async () => {
  const fixture = await addFixture({ prices: ["0.10", "0.20"] });

  const created = await postOrder(fixture, "CARD", [3, 1]);

  assert.equal(created.status, 201);
  assert.equal(created.body.totalAmount, "0.5");
  const saved = await prisma.order.findUniqueOrThrow({
    where: { id: created.body.id },
  });
  assert.equal(saved.totalAmount.toFixed(2), "0.50");
});

test("OrderItem keeps its price after the product price changes", async () => {
  const fixture = await addFixture({ prices: ["1.25"] });
  const created = await postOrder(fixture, "CARD", [2]);
  assert.equal(created.status, 201);

  const updatedProduct = await api(
    "PUT",
    `/products/${fixture.products[0]!.id}`,
    { price: 9.99 },
    admin.token,
  );
  const savedItem = await prisma.orderItem.findFirstOrThrow({
    where: { orderId: created.body.id },
  });

  assert.equal(updatedProduct.status, 200);
  assert.equal(savedItem.price.toFixed(2), "1.25");
  const savedOrder = await prisma.order.findUniqueOrThrow({
    where: { id: created.body.id },
  });
  assert.equal(savedOrder.totalAmount.toFixed(2), "2.50");
});

test("an error inside the transaction rolls back order and bonus debit", async () => {
  const fixture = await addFixture({
    suffix: "-rollback",
    bonusBalance: "10.00",
    prices: ["5.00"],
  });
  await dropRollbackTrigger();
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION ice_shop_test_fail_order_insert()
    RETURNS trigger AS $$
    BEGIN
      IF NEW."customerId" LIKE 'it-%-rollback-customer' THEN
        RAISE EXCEPTION 'forced integration test failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "ice_shop_test_fail_order_insert"
    BEFORE INSERT ON "Order"
    FOR EACH ROW EXECUTE FUNCTION ice_shop_test_fail_order_insert()
  `);

  const result = await postOrder(fixture, "BONUS");

  assert.equal(result.status, 500);
  assert.equal(
    await prisma.order.count({ where: { customerId: fixture.customer.id } }),
    0,
  );
  await expectBalance(fixture.customer.id, "10.00");
});

test("admin can create an order on behalf of a customer (POS)", async () => {
  const fixture = await addFixture({ prices: ["10.00"] });

  const result = await api(
    "POST",
    "/orders",
    {
      customerId: fixture.customer.id,
      paymentMethod: "CASH",
      items: orderItems(fixture),
      ...delivery,
    },
    admin.token,
  );

  assert.equal(result.status, 201);
  assert.equal(result.body.customer.id, fixture.customer.id);
});

test("customerId in the body is ignored for customers", async () => {
  const fixture = await addFixture({ prices: ["10.00"] });
  const other = await addCustomer("-other");

  const result = await api(
    "POST",
    "/orders",
    {
      customerId: other.id,
      paymentMethod: "CARD",
      items: orderItems(fixture),
      ...delivery,
    },
    fixture.customerToken,
  );

  assert.equal(result.status, 201);
  assert.equal(result.body.customer.id, fixture.customer.id);
});

test("creating an order for a missing customer returns 404", async () => {
  const fixture = await addFixture();

  const result = await api(
    "POST",
    "/orders",
    {
      customerId: `${prefix}-missing-customer`,
      paymentMethod: "CARD",
      items: orderItems(fixture),
      ...delivery,
    },
    admin.token,
  );

  assert.equal(result.status, 404);
});

test("creating an order with a missing product returns 404", async () => {
  const fixture = await addFixture();

  const result = await api(
    "POST",
    "/orders",
    {
      paymentMethod: "CARD",
      items: [{ productId: `${prefix}-missing-product`, quantity: 1 }],
      ...delivery,
    },
    fixture.customerToken,
  );

  assert.equal(result.status, 404);
});

test("changing a completed order returns 409", async () => {
  const fixture = await addFixture();
  const created = await postOrder(fixture, "CARD");
  const completed = await api(
    "PUT",
    `/orders/${created.body.id}`,
    { status: "COMPLETED" },
    admin.token,
  );
  assert.equal(completed.status, 200);

  const result = await api(
    "PUT",
    `/orders/${created.body.id}`,
    { status: "PROCESSING" },
    admin.token,
  );

  assert.equal(result.status, 409);
});

test("duplicate email returns 409 for customer POST and PUT", async () => {
  const email = `${prefix}-shared@example.test`;
  const existing = await addCustomer("-email-existing", { email });
  const target = await addCustomer("-email-target");

  const posted = await api(
    "POST",
    "/customers",
    {
      name: `${prefix} duplicate email`,
      email,
      phone: `${prefix}-email-post-phone`,
    },
    admin.token,
  );
  const updated = await api("PUT", `/customers/${target.id}`, { email }, admin.token);

  assert.ok(existing);
  assert.equal(posted.status, 409);
  assert.equal(updated.status, 409);
});

test("duplicate phone returns 409 for customer POST and PUT", async () => {
  const phone = `${prefix}-shared-phone`;
  const existing = await addCustomer("-phone-existing", { phone });
  const target = await addCustomer("-phone-target");

  const posted = await api(
    "POST",
    "/customers",
    {
      name: `${prefix} duplicate phone`,
      email: `${prefix}-phone-post@example.test`,
      phone,
    },
    admin.token,
  );
  const updated = await api("PUT", `/customers/${target.id}`, { phone }, admin.token);

  assert.ok(existing);
  assert.equal(posted.status, 409);
  assert.equal(updated.status, 409);
});
