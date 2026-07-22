import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import {
  matchPayment,
  extractPaymentRef,
  generatePaymentRef,
  buildPaymentUrl,
  clampStatementFrom,
  type StatementItem,
} from "../../../src/lib/monobank.js";

// paymentAmount = totalAmount + «копеечный хвост»
const paymentAmount = new Prisma.Decimal("123.45");
// Заказ создан за ~11.5 суток до транзакции item() — транзакция в окне.
const createdAt = new Date(1_769_000_000 * 1000);

function item(overrides: Partial<StatementItem>): StatementItem {
  return { id: "t1", time: 1_770_000_000, amount: 12_345, comment: "ICE-AB12CD34", ...overrides };
}

test("matches exact amount with matching ref", () => {
  assert.equal(matchPayment([item({})], "ICE-AB12CD34", paymentAmount, createdAt), true);
});

test("matches ref inside longer comment, case-insensitive", () => {
  assert.equal(
    matchPayment([item({ comment: "оплата ice-ab12cd34 дякую" })], "ICE-AB12CD34", paymentAmount, createdAt),
    true,
  );
});

test("matches exact amount without comment (перевод из другого банка)", () => {
  assert.equal(matchPayment([item({ comment: undefined })], "ICE-AB12CD34", paymentAmount, createdAt), true);
  assert.equal(matchPayment([item({ comment: "просто перевод" })], "ICE-AB12CD34", paymentAmount, createdAt), true);
});

test("rejects foreign ref even with exact amount", () => {
  assert.equal(matchPayment([item({ comment: "ICE-FF00FF00" })], "ICE-AB12CD34", paymentAmount, createdAt), false);
});

test("rejects wrong amount even with correct ref", () => {
  assert.equal(matchPayment([item({ amount: 12_346 })], "ICE-AB12CD34", paymentAmount, createdAt), false);
  assert.equal(matchPayment([item({ amount: 12_300 })], "ICE-AB12CD34", paymentAmount, createdAt), false);
});

test("rejects outgoing (negative) transaction with same abs amount", () => {
  assert.equal(matchPayment([item({ amount: -12_345 })], "ICE-AB12CD34", paymentAmount, createdAt), false);
});

test("rejects transaction older than order creation (переиспользованный хвост)", () => {
  const orderCreatedAt = new Date((1_770_000_000 + 3600) * 1000);
  assert.equal(
    matchPayment([item({ comment: undefined })], "ICE-AB12CD34", paymentAmount, orderCreatedAt),
    false,
  );
  // Небольшое расхождение часов (< 60с) не отвергает свежую транзакцию.
  const slightlyAfter = new Date((1_770_000_000 + 30) * 1000);
  assert.equal(matchPayment([item({})], "ICE-AB12CD34", paymentAmount, slightlyAfter), true);
});

test("extractPaymentRef finds ref or returns null", () => {
  assert.equal(extractPaymentRef("платіж ice-ab12cd34"), "ICE-AB12CD34");
  assert.equal(extractPaymentRef("просто перевод"), null);
});

test("generatePaymentRef format is extractable", () => {
  const ref = generatePaymentRef();
  assert.match(ref, /^ICE-[0-9A-F]{8}$/);
  assert.equal(extractPaymentRef(`оплата ${ref}`), ref);
});

test("buildPaymentUrl prefills amount and encoded ref", () => {
  process.env.MONOBANK_SEND_URL = "https://send.monobank.ua/abc123";
  assert.equal(
    buildPaymentUrl("ICE-AB12CD34", paymentAmount),
    "https://send.monobank.ua/abc123?a=123.45&t=ICE-AB12CD34",
  );
  delete process.env.MONOBANK_SEND_URL;
  assert.throws(() => buildPaymentUrl("ICE-AB12CD34", paymentAmount));
});

test("clamps statement start to Monobank's maximum interval", () => {
  const now = Date.UTC(2026, 6, 22, 12);
  const recent = new Date(now - 60_000);
  assert.equal(clampStatementFrom(recent, now).getTime(), recent.getTime());
  assert.equal(
    clampStatementFrom(new Date(0), now).getTime(),
    now - 31 * 24 * 60 * 60 * 1000,
  );
});
