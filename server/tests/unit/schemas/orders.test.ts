import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import {
  createOrderSchema,
  isOrderTotalValid,
  updateOrderSchema,
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
