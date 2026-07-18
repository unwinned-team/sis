import assert from "node:assert/strict";
import test from "node:test";
import { imageUrlSchema, replaceImageSchema } from "../../../src/schemas/images.js";

test("image url must point into /uploads/", () => {
  assert.equal(imageUrlSchema.safeParse({ url: "/uploads/a.png" }).success, true);
  for (const url of ["", "/etc/passwd", "uploads/a.png", "https://example.test/uploads/a.png", "/upload/a.png"]) {
    assert.equal(imageUrlSchema.safeParse({ url }).success, false, `url "${url}" must be rejected`);
  }
});

test("replace oldUrl must point into /uploads/", () => {
  assert.equal(replaceImageSchema.safeParse({ oldUrl: "/uploads/a.png" }).success, true);
  for (const oldUrl of ["", "/etc/passwd", "uploads/a.png", "https://example.test/uploads/a.png"]) {
    assert.equal(replaceImageSchema.safeParse({ oldUrl }).success, false, `oldUrl "${oldUrl}" must be rejected`);
  }
});
