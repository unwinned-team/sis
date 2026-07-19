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

test("listOrdersQuerySchema applies defaults for take/skip", () => {
  const result = listOrdersQuerySchema.safeParse({});
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.take, 50);
    assert.equal(result.data.skip, 0);
  }
});

test("listOrdersQuerySchema parses query params from strings", () => {
  const result = listOrdersQuerySchema.safeParse({
    take: "20",
    skip: "10",
    status: "PROCESSING",
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.take, 20);
    assert.equal(result.data.skip, 10);
    assert.equal(result.data.status, "PROCESSING");
  }
});

test("listOrdersQuerySchema rejects out-of-range take", () => {
  assert.equal(listOrdersQuerySchema.safeParse({ take: "0" }).success, false);
  assert.equal(listOrdersQuerySchema.safeParse({ take: "101" }).success, false);
});

test("listOrdersQuerySchema rejects invalid status", () => {
  assert.equal(listOrdersQuerySchema.safeParse({ status: "INVALID" }).success, false);
});

test("listOrdersQuerySchema validates from/to as ISO datetimes", () => {
  assert.equal(
    listOrdersQuerySchema.safeParse({
      from: "2026-07-01T00:00:00Z",
      to: "2026-07-19T23:59:59+03:00",
    }).success,
    true,
  );
  assert.equal(listOrdersQuerySchema.safeParse({ from: "2026-07-01" }).success, false);
  assert.equal(listOrdersQuerySchema.safeParse({ to: "not-a-date" }).success, false);
});
