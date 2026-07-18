import assert from "node:assert/strict";
import test from "node:test";
import {
  categoryParamsSchema,
  createCategorySchema,
  updateCategorySchema,
} from "../../../src/schemas/categories.js";

const validSlugs = ["ice-cream", "a", "gelato-2", "2-in-1", "x0"];
const invalidSlugs = [
  "",
  "Ice-Cream",
  "ice cream",
  "-ice",
  "ice-",
  "ice--cream",
  "мороженое",
  "ice_cream",
  "ice/cream",
];

test("category slug accepts kebab-case and rejects everything else", () => {
  for (const slug of validSlugs) {
    assert.equal(categoryParamsSchema.safeParse({ slug }).success, true, `slug "${slug}" must be accepted`);
    assert.equal(
      createCategorySchema.safeParse({ name: "Ice cream", slug }).success,
      true,
      `create with slug "${slug}" must be accepted`,
    );
  }
  for (const slug of invalidSlugs) {
    assert.equal(categoryParamsSchema.safeParse({ slug }).success, false, `slug "${slug}" must be rejected`);
    assert.equal(
      createCategorySchema.safeParse({ name: "Ice cream", slug }).success,
      false,
      `create with slug "${slug}" must be rejected`,
    );
    assert.equal(
      updateCategorySchema.safeParse({ slug }).success,
      false,
      `update with slug "${slug}" must be rejected`,
    );
  }
});

test("category create requires a non-empty name and a slug", () => {
  assert.equal(createCategorySchema.safeParse({ name: "", slug: "ok" }).success, false);
  assert.equal(createCategorySchema.safeParse({ slug: "ok" }).success, false);
  assert.equal(createCategorySchema.safeParse({ name: "Ok" }).success, false);
  assert.equal(createCategorySchema.safeParse({ name: "Ok", slug: "ok" }).success, true);
});

test("category update allows partial input and a nullable imageUrl", () => {
  assert.equal(updateCategorySchema.safeParse({}).success, true);
  assert.equal(updateCategorySchema.safeParse({ name: "New name" }).success, true);
  assert.equal(updateCategorySchema.safeParse({ name: "" }).success, false);
  // null затирает картинку, undefined оставляет как есть.
  assert.equal(updateCategorySchema.safeParse({ imageUrl: null }).success, true);
  assert.equal(updateCategorySchema.safeParse({ imageUrl: "/uploads/a.png" }).success, true);
});
