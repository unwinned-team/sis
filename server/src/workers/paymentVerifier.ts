import prisma from "../prisma.js";
import log from "../logger.js";
import { fetchStatement, matchPayment } from "../lib/monobank.js";

// Лимит monobank statement — 1 запрос/60с. Цепочка setTimeout после
// завершения tick-а (как в refreshTokens cleanup) гарантирует паузу >= TICK_MS
// между запросами независимо от длительности самого запроса.
const TICK_MS = 60_000;
// ~30 мин проверок; дальше заказ остаётся CLAIMED для ручного разбора
// (nextCheckAt=null выводит его из очереди), авто-FAILED сознательно нет.
const MAX_ATTEMPTS = 30;

// Один pull выписки за tick покрывает весь период — матчим сразу все заказы
// очереди. Идемпотентен: PAID ставится условным update из CLAIMED и не понижается.
// При рестарте очередь восстанавливается из БД (nextCheckAt), не из памяти.
export async function verifyClaimedPayments(): Promise<void> {
  const claimed = await prisma.order.findMany({
    where: { paymentStatus: "CLAIMED", nextCheckAt: { lte: new Date() } },
    orderBy: { nextCheckAt: "asc" },
  });
  if (claimed.length === 0) return; // пустая очередь — без запроса к API

  const oldest = claimed.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
  const statement = await fetchStatement(oldest.createdAt);

  for (const order of claimed) {
    // CLAIMED бывает только у CARD-заказов (webhook матчит ref/paymentAmountKey);
    // страховка от ручных правок в БД.
    if (!order.paymentRef || !order.paymentAmount) continue;
    if (matchPayment(statement, order.paymentRef, order.paymentAmount)) {
      const updated = await prisma.order.updateMany({
        where: { id: order.id, paymentStatus: "CLAIMED" },
        // paymentAmountKey=null освобождает «копеечный хвост» для новых заказов.
        data: { paymentStatus: "PAID", nextCheckAt: null, paymentAmountKey: null },
      });
      if (updated.count > 0) {
        log.info(
          { orderId: order.id, paymentRef: order.paymentRef },
          "Payment confirmed",
        );
      }
    } else {
      const exhausted = order.verifyAttempts + 1 >= MAX_ATTEMPTS;
      await prisma.order.updateMany({
        where: { id: order.id, paymentStatus: "CLAIMED" },
        data: {
          verifyAttempts: { increment: 1 },
          nextCheckAt: exhausted ? null : new Date(Date.now() + TICK_MS),
        },
      });
      if (exhausted) {
        log.warn(
          { orderId: order.id, paymentRef: order.paymentRef },
          "Payment not found after max attempts; left CLAIMED for manual review",
        );
      }
    }
  }
}

// Запускается один раз при старте сервера (index.ts, не в тестах).
export function startPaymentVerifier(): void {
  if (!process.env.MONOBANK_TOKEN) {
    log.warn("MONOBANK_TOKEN not set; payment verifier disabled");
    return;
  }
  const run = async () => {
    try {
      await verifyClaimedPayments();
    } catch (error) {
      // Ошибка (в т.ч. 429) не трогает nextCheckAt — те же заказы уйдут в
      // следующий tick без потери попыток.
      log.error(error, "Payment verification tick failed");
    }
    setTimeout(run, TICK_MS).unref();
  };
  // Первый tick отложен: разносим по времени с setWebhook при старте
  // (лимит /personal/ общий на токен).
  setTimeout(run, TICK_MS).unref();
}
