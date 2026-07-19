import assert from "node:assert/strict";
import test from "node:test";
import {
  createProductSchema,
  productParamsSchema,
  updateProductSchema,
  variantParamsSchema,
  createVariantSchema,
  updateVariantSchema,
} from "../../../src/schemas/products.js";

const validProduct = {
  name: "Vanilla",
  description: "Classic vanilla ice cream",
  price: 10.5,
  categoryId: "category-1",
  imageUrl: "https://example.test/vanilla.png",
};

test("product create accepts a valid payload", () => {
  assert.equal(createProductSchema.safeParse(validProduct).success, true);
});

test("product create requires every field", () => {
  for (const field of ["name", "description", "price", "categoryId", "imageUrl"] as const) {
    const { [field]: _omitted, ...rest } = validProduct;
    assert.equal(createProductSchema.safeParse(rest).success, false, `missing ${field} must be rejected`);
  }
  assert.equal(createProductSchema.safeParse({ ...validProduct, name: "" }).success, false);
  assert.equal(createProductSchema.safeParse({ ...validProduct, description: "" }).success, false);
});

test("product create accepts local image paths like /uploads/xxx.jpg", () => {
  assert.equal(
    createProductSchema.safeParse({ ...validProduct, imageUrl: "/uploads/abc123.jpg" }).success,
    true,
  );
});

test("product create rejects empty imageUrl", () => {
  assert.equal(
    createProductSchema.safeParse({ ...validProduct, imageUrl: "" }).success,
    false,
  );
});

test("price accepts Decimal(10,2) values and boundary", () => {
  for (const price of [0.01, 1, 10.5, 10.99, 99_999_999.99]) {
    assert.equal(
      createProductSchema.safeParse({ ...validProduct, price }).success,
      true,
      `price ${price} must be accepted`,
    );
  }
});

test("price rejects zero, negatives, overflow, extra decimals and non-numbers", () => {
  for (const price of [0, -5, 100_000_000, 10.001, "10", null, NaN]) {
    assert.equal(
      createProductSchema.safeParse({ ...validProduct, price }).success,
      false,
      `price ${String(price)} must be rejected`,
    );
    assert.equal(
      updateProductSchema.safeParse({ price }).success,
      false,
      `update price ${String(price)} must be rejected`,
    );
  }
});

test("product update accepts isAvailable and isArchived flags", () => {
  assert.equal(updateProductSchema.safeParse({ isAvailable: false }).success, true);
  assert.equal(updateProductSchema.safeParse({ isAvailable: true }).success, true);
  assert.equal(updateProductSchema.safeParse({ isArchived: false }).success, true);
  assert.equal(updateProductSchema.safeParse({ isArchived: true }).success, true);
});

test("product update allows partial input but not empty strings", () => {
  assert.equal(updateProductSchema.safeParse({}).success, true);
  assert.equal(updateProductSchema.safeParse({ name: "New" }).success, true);
  assert.equal(updateProductSchema.safeParse({ price: 12.34 }).success, true);
  assert.equal(updateProductSchema.safeParse({ name: "" }).success, false);
  assert.equal(updateProductSchema.safeParse({ description: "" }).success, false);
  assert.equal(updateProductSchema.safeParse({ categoryId: "" }).success, false);
  assert.equal(updateProductSchema.safeParse({ imageUrl: "" }).success, false);
});

test("product params require a non-empty id", () => {
  assert.equal(productParamsSchema.safeParse({ id: "abc" }).success, true);
  assert.equal(productParamsSchema.safeParse({ id: "" }).success, false);
  assert.equal(productParamsSchema.safeParse({}).success, false);
});

test("variant params require both ids", () => {
  assert.equal(variantParamsSchema.safeParse({ productId: "p1", variantId: "v1" }).success, true);
  assert.equal(variantParamsSchema.safeParse({ productId: "", variantId: "v1" }).success, false);
  assert.equal(variantParamsSchema.safeParse({ productId: "p1", variantId: "" }).success, false);
  assert.equal(variantParamsSchema.safeParse({ productId: "p1" }).success, false);
});

test("createVariantSchema requires price", () => {
  assert.equal(createVariantSchema.safeParse({ price: 10.99 }).success, true);
  assert.equal(createVariantSchema.safeParse({ price: 10.99, taste: "Mint" }).success, true);
  assert.equal(createVariantSchema.safeParse({ price: 10.99, size: "100ml" }).success, true);
  assert.equal(createVariantSchema.safeParse({}).success, false);
  assert.equal(createVariantSchema.safeParse({ taste: "Mint" }).success, false);
});

test("updateVariantSchema allows partial", () => {
  assert.equal(updateVariantSchema.safeParse({}).success, true);
  assert.equal(updateVariantSchema.safeParse({ price: 12.34 }).success, true);
  assert.equal(updateVariantSchema.safeParse({ taste: "Mint" }).success, true);
});
