import assert from "node:assert/strict";
import test from "node:test";

// Секрет задаётся до импорта модуля: jwt.ts валидирует его при загрузке
// (dotenv не перетирает уже установленные переменные окружения).
process.env.JWT_ACCESS_SECRET = "integration-test-secret-0123456789abcdef";

const { signAccessToken, verifyAccessToken } = await import("./jwt.js");

test("signed access token verifies and returns sub and role", async () => {
  const token = await signAccessToken({ sub: "customer-1", role: "ADMIN" });
  const payload = await verifyAccessToken(token);

  assert.deepEqual(payload, { sub: "customer-1", role: "ADMIN" });
});

test("tampered token is rejected", async () => {
  const token = await signAccessToken({ sub: "customer-1", role: "CUSTOMER" });
  const [header, body] = token.split(".");
  const forgedBody = Buffer.from(
    JSON.stringify({ sub: "customer-1", role: "ADMIN", exp: Math.floor(Date.now() / 1000) + 900 }),
  ).toString("base64url");

  await assert.rejects(verifyAccessToken(`${header}.${forgedBody}.${token.split(".")[2]}`));
  await assert.rejects(verifyAccessToken(`${token}x`));
  await assert.rejects(verifyAccessToken(`${header}.${body}.`));
});

test("garbage and empty tokens are rejected", async () => {
  await assert.rejects(verifyAccessToken(""));
  await assert.rejects(verifyAccessToken("not-a-jwt"));
});

test("token with an unknown role is rejected", async () => {
  const { SignJWT } = await import("jose");
  const key = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET);
  const token = await new SignJWT({ role: "SUPERUSER" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("customer-1")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(key);

  await assert.rejects(verifyAccessToken(token));
});

test("expired token is rejected", async () => {
  const { SignJWT } = await import("jose");
  const key = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET);
  const token = await new SignJWT({ role: "CUSTOMER" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("customer-1")
    .setIssuedAt(Math.floor(Date.now() / 1000) - 1800)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 900)
    .sign(key);

  await assert.rejects(verifyAccessToken(token));
});
