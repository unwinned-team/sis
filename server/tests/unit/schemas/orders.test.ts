import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import {
  createOrderSchema,
  isOrderTotalValid,
  updateOrderSchema,
  listOrdersQuerySchema,
} from "../../../src/schemas/orders.js";

const item = { productId: "product-1", quantity: 1 };

test("order input rejects duplicate products", () => {
  assert.equal(
    createOrderSchema.safeParse({
      customerId: "customer-1",
      paymentMethod: "CARD",
      items: [item, item],
    }).success,
    false,
  );
});

test("order input rejects an empty item list", () => {
  assert.equal(
    createOrderSchema.safeParse({
      customerId: "customer-1",
      paymentMethod: "CARD",
      items: [],
    }).success,
    false,
  );
});

test("order input rejects invalid PostgreSQL Int quantities", () => {
  for (const quantity of [0, -1, 1.5, 2_147_483_648]) {
    assert.equal(
      createOrderSchema.safeParse({
        customerId: "customer-1",
        paymentMethod: "CARD",
        items: [{ ...item, quantity }],
      }).success,
      false,
      `quantity ${quantity} must be rejected`,
    );
  }
});

test("order total accepts Decimal(10,2) boundary and rejects overflow", () => {
  assert.equal(isOrderTotalValid(new Prisma.Decimal("99999999.99")), true);
  assert.equal(isOrderTotalValid(new Prisma.Decimal("100000000.00")), false);
});

test("order updates reject payment method changes", () => {
  assert.equal(
    updateOrderSchema.safeParse({
      status: "PROCESSING",
      paymentMethod: "BONUS",
    }).success,
    false,
  );
});

test("order list query applies take/skip defaults", () => {
  const parsed = listOrdersQuerySchema.parse({});
  assert.equal(parsed.take, 50);
  assert.equal(parsed.skip, 0);
});

test("order list query clamps take to 1..100", () => {
  assert.equal(listOrdersQuerySchema.safeParse({ take: "1" }).success, true);
  assert.equal(listOrdersQuerySchema.safeParse({ take: "100" }).success, true);
  assert.equal(listOrdersQuerySchema.safeParse({ take: "0" }).success, false);
  assert.equal(listOrdersQuerySchema.safeParse({ take: "101" }).success, false);
  assert.equal(listOrdersQuerySchema.safeParse({ skip: "-1" }).success, false);
});

// Без этой проверки перевёрнутый период отдал бы пустую выдачу без объяснения.
test("order list query rejects an inverted period", () => {
  const from = "2026-07-20T00:00:00.000Z";
  const to = "2026-07-10T00:00:00.000Z";
  assert.equal(listOrdersQuerySchema.safeParse({ from, to }).success, false);
  assert.equal(listOrdersQuerySchema.safeParse({ from: to, to: from }).success, true);
  assert.equal(listOrdersQuerySchema.safeParse({ from, to: from }).success, true);
});

test("order list query rejects unknown filters", () => {
  assert.equal(listOrdersQuerySchema.safeParse({ customerId: "customer-1" }).success, false);
});
