import prisma from "../prisma.js";
import log from "../logger.js";
import { fetchStatement, matchPayment } from "../lib/monobank.js";

// Лимит monobank statement — 1 запрос/60с. Цепочка setTimeout после
// завершения tick-а (как в refreshTokens cleanup) гарантирует паузу >= TICK_MS
// между запросами независимо от длительности самого запроса.
const TICK_MS = 60_000;
// ~30 мин частых проверок CLAIMED; дальше — редкий backoff до терминального
// статуса, чтобы поздний реальный платёж всё же подтвердился (fake webhook
// иначе глушил бы автопроверку навсегда). PENDING проверяется до терминального
// перехода, чтобы webhook не был единственной точкой доставки подтверждения.
const MAX_ATTEMPTS = 30;
const EXHAUSTED_BACKOFF_MS = 60 * 60 * 1000;
// 6 часов часового backoff (30 быстрых + 6 редких = 36 всего), потом FAILED
const MAX_TOTAL_ATTEMPTS = 36;
const ACTIVE_ORDER_STATUSES = ["NEW", "PROCESSING"] as const;
const VERIFIABLE_PAYMENT_STATUSES = ["PENDING", "CLAIMED"] as const;

// Один pull выписки за tick покрывает весь период — матчим сразу все заказы
// очереди. Идемпотентен: PAID ставится условным update и не понижается.
// При рестарте очередь восстанавливается из БД (nextCheckAt), не из памяти.
export async function verifyClaimedPayments(): Promise<void> {
  const payments = await prisma.order.findMany({
    where: {
      paymentMethod: "CARD",
      status: { in: [...ACTIVE_ORDER_STATUSES] },
      paymentStatus: { in: [...VERIFIABLE_PAYMENT_STATUSES] },
      paymentRef: { not: null },
      paymentAmount: { not: null },
      nextCheckAt: { lte: new Date() },
    },
    orderBy: { nextCheckAt: "asc" },
  });
  if (payments.length === 0) return; // пустая очередь — без запроса к API

  const oldest = payments.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
  const statement = await fetchStatement(oldest.createdAt);

  for (const order of payments) {
    // Prisma keeps nullable field types even after `not: null` filters.
    if (!order.paymentRef || !order.paymentAmount) continue;
    if (
      matchPayment(
        statement,
        order.paymentRef,
        order.paymentAmount,
        order.createdAt,
      )
    ) {
      const updated = await prisma.order.updateMany({
        where: {
          id: order.id,
          status: { in: [...ACTIVE_ORDER_STATUSES] },
          paymentStatus: { in: [...VERIFIABLE_PAYMENT_STATUSES] },
        },
        // paymentAmountKey=null освобождает «копеечный хвост» для новых заказов.
        data: {
          paymentStatus: "PAID",
          nextCheckAt: null,
          paymentAmountKey: null,
        },
      });
      if (updated.count > 0) {
        log.info(
          { orderId: order.id, paymentRef: order.paymentRef },
          "Payment confirmed",
        );
      }
    } else if (order.paymentStatus === "PENDING") {
      await prisma.order.updateMany({
        where: {
          id: order.id,
          status: { in: [...ACTIVE_ORDER_STATUSES] },
          paymentStatus: "PENDING",
        },
        data: { nextCheckAt: new Date(Date.now() + TICK_MS) },
      });
    } else {
      const attempts = order.verifyAttempts + 1;
      const exhausted = attempts >= MAX_ATTEMPTS;
      const expired = attempts >= MAX_TOTAL_ATTEMPTS;
      if (expired) {
        await prisma.order.updateMany({
          where: {
            id: order.id,
            status: { in: [...ACTIVE_ORDER_STATUSES] },
            paymentStatus: "CLAIMED",
          },
          data: {
            paymentStatus: "FAILED",
            nextCheckAt: null,
            paymentAmountKey: null,
          },
        });
        log.warn(
          { orderId: order.id, paymentRef: order.paymentRef },
          "Payment not confirmed after max total attempts; marked as FAILED",
        );
      } else {
        await prisma.order.updateMany({
          where: {
            id: order.id,
            status: { in: [...ACTIVE_ORDER_STATUSES] },
            paymentStatus: "CLAIMED",
          },
          data: {
            verifyAttempts: { increment: 1 },
            nextCheckAt: new Date(
              Date.now() + (exhausted ? EXHAUSTED_BACKOFF_MS : TICK_MS),
            ),
          },
        });
        if (attempts === MAX_ATTEMPTS) {
          log.warn(
            { orderId: order.id, paymentRef: order.paymentRef },
            "Payment not found after max attempts; rechecking hourly up to 6 more hours",
          );
        }
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
