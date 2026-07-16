import assert from "node:assert/strict";
import test from "node:test";
import { createOrderSchema, updateOrderSchema } from "./orders.js";

const item = { productId: "product-1", quantity: 1 };

test("order input rejects duplicate products and oversized quantities", () => {
  assert.equal(
    createOrderSchema.safeParse({
      customerId: "customer-1",
      paymentMethod: "CARD",
      items: [item, item],
    }).success,
    false,
  );
  assert.equal(
    createOrderSchema.safeParse({
      customerId: "customer-1",
      paymentMethod: "CARD",
      items: [{ ...item, quantity: 2_147_483_648 }],
    }).success,
    false,
  );
});

test("order updates reject payment method changes", () => {
  assert.equal(updateOrderSchema.safeParse({ paymentMethod: "BONUS" }).success, false);
  assert.equal(updateOrderSchema.safeParse({ status: "COMPLETED" }).success, true);
});
