import assert from "node:assert/strict";
import test from "node:test";
import {
  hashPassword,
  verifyPassword,
  DUMMY_HASH,
} from "../../../src/lib/password.js";

test("hashed password verifies and rejects a wrong password", async () => {
  const hash = await hashPassword("correct horse battery staple");

  assert.equal(
    await verifyPassword("correct horse battery staple", hash),
    true,
  );
  assert.equal(await verifyPassword("wrong password", hash), false);
});

test("hashes are salted: same password gives different hashes", async () => {
  const first = await hashPassword("same-password");
  const second = await hashPassword("same-password");

  assert.notEqual(first, second);
  assert.equal(await verifyPassword("same-password", first), true);
  assert.equal(await verifyPassword("same-password", second), true);
});

test("hash format embeds parseable scrypt parameters", async () => {
  const hash = await hashPassword("any-password");
  const [scheme, N, r, p, salt, digest] = hash.split("$");

  assert.equal(scheme, "scrypt");
  assert.deepEqual([N, r, p], ["32768", "8", "1"]);
  assert.ok(salt!.length > 0);
  assert.ok(digest!.length > 0);
});

test("verify supports different parameters parsed from the stored hash", async () => {
  // Хэш с пониженными параметрами — старый формат должен проверяться и после
  // повышения дефолтов.
  const { scryptSync, randomBytes } = await import("node:crypto");
  const salt = randomBytes(16);
  const digest = scryptSync("legacy-password", salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
  });
  const legacy = `scrypt$16384$8$1$${salt.toString("base64url")}$${digest.toString("base64url")}`;

  assert.equal(await verifyPassword("legacy-password", legacy), true);
  assert.equal(await verifyPassword("wrong", legacy), false);
});

test("malformed stored hashes are rejected without throwing", async () => {
  for (const stored of [
    "",
    "not-a-hash",
    "bcrypt$10$abc$def",
    "scrypt$0$8$1$aaaa$bbbb",
    "scrypt$32768$8$1",
  ]) {
    assert.equal(
      await verifyPassword("password", stored),
      false,
      `stored "${stored}"`,
    );
  }
});

test("DUMMY_HASH is well-formed and never matches", async () => {
  assert.match(
    DUMMY_HASH,
    /^scrypt\$32768\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/,
  );
  assert.equal(await verifyPassword("any password at all", DUMMY_HASH), false);
});
