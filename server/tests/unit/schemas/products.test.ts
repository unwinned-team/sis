import assert from "node:assert/strict";
import test from "node:test";
import {
  createProductSchema,
  updateProductSchema,
  createVariantSchema,
  updateVariantSchema,
  listProductsQuerySchema,
} from "../../../src/schemas/products.js";

const validProduct = {
  name: "Product",
  description: "Description",
  price: 10.5,
  categoryId: "category-1",
  imageUrl: "https://example.test/product.png",
};

test("product imageUrl accepts both a full URL and an /uploads path", () => {
  for (const imageUrl of [
    "https://example.test/product.png",
    "/uploads/1f0a9c2e-4d3b.jpg",
    "/products/hookahs/amstaff.jpg",
  ]) {
    assert.equal(
      createProductSchema.safeParse({ ...validProduct, imageUrl }).success,
      true,
      `${imageUrl} must be accepted`,
    );
  }
});

test("product imageUrl still rejects values that are neither", () => {
  for (const imageUrl of ["", "uploads/no-leading-slash.jpg", "not a url", "../etc/passwd"]) {
    assert.equal(
      createProductSchema.safeParse({ ...validProduct, imageUrl }).success,
      false,
      `${imageUrl} must be rejected`,
    );
  }
});

// Регресс на «тихий no-op»: без .strict() неизвестный ключ отбрасывался и
// запрос отвечал 200, хотя товар не менялся.
test("product update rejects unknown keys instead of dropping them", () => {
  assert.equal(updateProductSchema.safeParse({ nope: true }).success, false);
  assert.equal(
    updateProductSchema.safeParse({ price: 1, isAdmin: true }).success,
    false,
  );
});

test("product update accepts the availability and archive flags", () => {
  assert.equal(updateProductSchema.safeParse({ isAvailable: false }).success, true);
  assert.equal(updateProductSchema.safeParse({ isArchived: false }).success, true);
});

test("includeArchived is parsed as a boolean and defaults to false", () => {
  assert.equal(listProductsQuerySchema.parse({}).includeArchived, false);
  assert.equal(
    listProductsQuerySchema.parse({ includeArchived: "true" }).includeArchived,
    true,
  );
  assert.equal(
    listProductsQuerySchema.parse({ includeArchived: "false" }).includeArchived,
    false,
  );
  // Не boolean-подобная строка — ошибка, а не молчаливое false.
  assert.equal(listProductsQuerySchema.safeParse({ includeArchived: "1" }).success, false);
});

test("variant creation requires a price and at least one of taste/size", () => {
  assert.equal(createVariantSchema.safeParse({ taste: "Мята", price: 15 }).success, true);
  assert.equal(createVariantSchema.safeParse({ size: "30 мл", price: 15 }).success, true);
  assert.equal(createVariantSchema.safeParse({ price: 15 }).success, false);
  assert.equal(createVariantSchema.safeParse({ taste: "Мята" }).success, false);
});

test("variant price must be positive with at most two decimals", () => {
  for (const price of [0, -1, 1.005]) {
    assert.equal(
      createVariantSchema.safeParse({ taste: "Мята", price }).success,
      false,
      `price ${price} must be rejected`,
    );
  }
});

test("variant update requires at least one field", () => {
  assert.equal(updateVariantSchema.safeParse({}).success, false);
  assert.equal(updateVariantSchema.safeParse({ price: 20 }).success, true);
  // Сброс вкуса до «базового» варианта — осмысленное изменение.
  assert.equal(updateVariantSchema.safeParse({ taste: null }).success, true);
});
