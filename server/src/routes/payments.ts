import type { Request, Response } from "express";
import { Router } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../prisma.js";
import log from "../logger.js";
import { extractPaymentRef } from "../lib/monobank.js";

const router = Router();

// Monobank проверяет URL GET-запросом при регистрации webhook-а.
router.get("/webhook", (_req: Request, res: Response) => {
  res.status(200).end();
});

// Публичный endpoint, телу НЕ доверяем: совпадение рефа лишь ставит заказ в
// очередь проверки (CLAIMED), оплату подтверждает воркер по выписке. Fake
// webhook даёт максимум лишний CLAIMED. Всегда 200 и сразу — monobank
// отключает webhook после серии ошибок/таймаутов.
router.post("/webhook", (req: Request, res: Response) => {
  res.status(200).end();
  void (async () => {
    try {
      const item = (req.body?.data?.statementItem ?? {}) as {
        comment?: unknown;
        amount?: unknown;
      };
      const comment = typeof item.comment === "string" ? item.comment : "";
      const amount =
        typeof item.amount === "number" && Number.isInteger(item.amount)
          ? item.amount
          : null;

      // Claim по рефу из комментария; без рефа — по точной сумме прихода
      // (копеечный хвост уникален среди активных заказов).
      const ref = extractPaymentRef(comment);
      let where: Prisma.OrderWhereInput;
      if (ref) {
        where = { paymentRef: ref, paymentStatus: "PENDING" };
      } else if (amount !== null && amount > 0) {
        where = {
          paymentAmountKey: new Prisma.Decimal(amount).div(100).toFixed(2),
          paymentStatus: "PENDING",
        };
      } else {
        return;
      }

      const claimed = await prisma.order.updateMany({
        where,
        data: { paymentStatus: "CLAIMED", nextCheckAt: new Date() },
      });
      if (claimed.count > 0) {
        // Каналов уведомлений (telegram/email) в проекте нет: «уведомление
        // админа» = лог + paymentStatus в админ-панели через GET /orders.
        log.info({ ref, amount }, "Payment claimed via webhook");
      }
    } catch (error) {
      log.error(error, "Webhook processing failed");
    }
  })();
});

export default router;
