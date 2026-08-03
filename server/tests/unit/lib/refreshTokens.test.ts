import assert from "node:assert/strict";
import test from "node:test";
import { refreshTokenTtlMs } from "../../../src/lib/tokenTtl.js";

// refresh админа живёт 7 дней, клиента — 30 дней.
test("customer refresh session lasts 30 days", () => {
  assert.equal(refreshTokenTtlMs("CUSTOMER"), 30 * 24 * 60 * 60 * 1000);
});

test("admin refresh session lasts 7 days", () => {
  assert.equal(refreshTokenTtlMs("ADMIN"), 7 * 24 * 60 * 60 * 1000);
});

test("admin session is strictly shorter than customer session", () => {
  assert.ok(refreshTokenTtlMs("ADMIN") < refreshTokenTtlMs("CUSTOMER"));
});
