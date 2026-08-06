import assert from "node:assert/strict";
import test from "node:test";
import {
  createBannerSchema,
  updateBannerSchema,
  bannerLinkSchema,
  reorderBannersSchema,
  bannerParamsSchema,
} from "../../../src/schemas/banners.js";

const validInternal = [
  "/category/ice-cream",
  "/category/gelato-2",
  "/category/a",
  "/product/cm1234567890abcdefghij",
  "/product/ckpqrstuvwxyz0123456789",
  "/search?q=hookah",
  "/search?category=tabak&sort=cheap",
];

const invalidInternal = [
  "/etc/passwd",
  "/category/",
  "/category/UPPER",
  "/category/ice cream",
  "/category/ice--cream",
  "/product/",
  "/product/123",
  "/product/abc",
  "/search?",
  "/search",
  "/promo/x",
];

const validExternal = [
  "https://example.com",
  "https://example.com/path",
  "https://unity-tobacco.example/promo",
];

const invalidExternal = [
  "http://example.com", // тільки https
  "javascript:alert(1)",
  "data:text/html,foo",
  "ftp://example.com",
  "example.com",
  "https://",
];

test("banner link accepts internal paths and https URLs", () => {
  for (const value of [...validInternal, ...validExternal]) {
    assert.equal(bannerLinkSchema.safeParse(value).success, true, `link "${value}" must be accepted`);
  }
});

test("banner link rejects traversal, wrong shape, non-https and empty", () => {
  for (const value of [...invalidInternal, ...invalidExternal, "", "  "]) {
    assert.equal(bannerLinkSchema.safeParse(value).success, false, `link "${value}" must be rejected`);
  }
});

test("banner link is too long over 2048", () => {
  const value = "/category/" + "a".repeat(2050);
  assert.equal(bannerLinkSchema.safeParse(value).success, false);
});

test("createBannerSchema requires imageUrl, accepts optional link/sortOrder", () => {
  assert.equal(createBannerSchema.safeParse({ imageUrl: "/uploads/x.webp" }).success, true);
  assert.equal(createBannerSchema.safeParse({ imageUrl: "/uploads/x.webp", link: null }).success, true);
  assert.equal(createBannerSchema.safeParse({ imageUrl: "/uploads/x.webp", link: "/category/ice" }).success, true);
  assert.equal(createBannerSchema.safeParse({ imageUrl: "/uploads/x.webp", sortOrder: 3 }).success, true);
  // imageUrl обов'язковий
  assert.equal(createBannerSchema.safeParse({}).success, false);
  assert.equal(createBannerSchema.safeParse({ imageUrl: "" }).success, false);
  // link має проходити валідацію
  assert.equal(createBannerSchema.safeParse({ imageUrl: "/uploads/x.webp", link: "/etc/passwd" }).success, false);
});

test("updateBannerSchema allows partial and explicitly nullable link", () => {
  assert.equal(updateBannerSchema.safeParse({}).success, true);
  assert.equal(updateBannerSchema.safeParse({ isActive: false }).success, true);
  assert.equal(updateBannerSchema.safeParse({ sortOrder: 1.5 }).success, false); // int() відкидає не-цілі
  // link: null знімає кликабельність, link: undefined лишає як є
  assert.equal(updateBannerSchema.safeParse({ link: null }).success, true);
  assert.equal(updateBannerSchema.safeParse({ link: "https://example.com" }).success, true);
  assert.equal(updateBannerSchema.safeParse({ link: "javascript:x" }).success, false);
});

test("reorderBannersSchema needs at least one id, all non-empty", () => {
  assert.equal(reorderBannersSchema.safeParse({ ids: ["a", "b"] }).success, true);
  assert.equal(reorderBannersSchema.safeParse({ ids: [] }).success, false);
  assert.equal(reorderBannersSchema.safeParse({ ids: [""] }).success, false);
  assert.equal(reorderBannersSchema.safeParse({}).success, false);
});

test("bannerParamsSchema requires id", () => {
  assert.equal(bannerParamsSchema.safeParse({ id: "abc" }).success, true);
  assert.equal(bannerParamsSchema.safeParse({}).success, false);
  assert.equal(bannerParamsSchema.safeParse({ id: "" }).success, false);
});
