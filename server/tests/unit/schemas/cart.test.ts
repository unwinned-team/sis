import assert from "node:assert/strict";
import test from "node:test";
import {
  addCartItemSchema,
  updateCartItemSchema,
  cartItemParamsSchema,
  MAX_CART_ITEM_QUANTITY,
} from "../../../src/schemas/cart.js";

test("add item accepts minimal input and defaults quantity to 1", () => {
  const result = addCartItemSchema.safeParse({ productId: "product-1" });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.quantity, 1);
    assert.equal(result.data.variantId, undefined);
  }
});

test("add item accepts a variant and an explicit quantity", () => {
  const result = addCartItemSchema.safeParse({
    productId: "product-1",
    variantId: "variant-1",
    quantity: MAX_CART_ITEM_QUANTITY,
  });
  assert.equal(result.success, true);
});

test("add item rejects invalid quantities", () => {
  for (const quantity of [0, -1, 1.5, MAX_CART_ITEM_QUANTITY + 1]) {
    assert.equal(
      addCartItemSchema.safeParse({ productId: "product-1", quantity }).success,
      false,
      `quantity ${quantity} must be rejected`,
    );
  }
});

test("add item rejects empty productId and variantId", () => {
  assert.equal(addCartItemSchema.safeParse({ productId: "" }).success, false);
  assert.equal(
    addCartItemSchema.safeParse({ productId: "product-1", variantId: "" }).success,
    false,
  );
});

test("add item rejects unknown keys", () => {
  assert.equal(
    addCartItemSchema.safeParse({ productId: "product-1", price: "1.00" }).success,
    false,
  );
});

test("update item requires a valid quantity", () => {
  assert.equal(updateCartItemSchema.safeParse({ quantity: 3 }).success, true);
  for (const quantity of [0, -1, 1.5, MAX_CART_ITEM_QUANTITY + 1]) {
    assert.equal(
      updateCartItemSchema.safeParse({ quantity }).success,
      false,
      `quantity ${quantity} must be rejected`,
    );
  }
});

test("update item rejects unknown keys", () => {
  assert.equal(
    updateCartItemSchema.safeParse({ quantity: 1, productId: "product-1" }).success,
    false,
  );
});

test("cart item params require a non-empty id", () => {
  assert.equal(cartItemParamsSchema.safeParse({ id: "item-1" }).success, true);
  assert.equal(cartItemParamsSchema.safeParse({ id: "" }).success, false);
});
