import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Prisma, Role, TokenClient } from "@prisma/client";
import prisma from "../prisma.js";
import log from "../logger.js";
import { httpError } from "./httpError.js";
import { REFRESH_TTL_MS } from "./tokenTtl.js";

// Реплей свежеотозванного токена с живым преемником — гонка ротации
// (пара вкладок, ответ потерян после коммита), не кража: окно прощает её
// и продолжает цепочку. Потолок: вор, реплеящий украденный токен в течение
// окна, остаётся жив; апгрейд — сверять IP заявителя с IP первой ротации.
export const REPLAY_GRACE_MS = 30 * 1000;
// Свежеотозванный преемник может быть ещё в незакоммиченной транзакции
// конкурента (READ COMMITTED его не видит) — пара повторов с паузой закрывает
// окно между claim и create, иначе 3+ вкладок всё ещё могли бы угодить в wipe.
const GRACE_FIND_RETRIES = 5;
const GRACE_FIND_BACKOFF_MS = 25;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function newRawToken(): string {
  return randomBytes(32).toString("base64url");
}

export interface IssuedRefreshToken {
  raw: string;
  expiresAt: Date;
}

// Login/register создают новую семью (одна семья = одна сессия/устройство).
export async function issueRefreshToken(
  customerId: string,
  client: TokenClient,
): Promise<IssuedRefreshToken> {
  const raw = newRawToken();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(raw),
      customerId,
      familyId: randomUUID(),
      client,
      expiresAt,
    },
  });
  return { raw, expiresAt };
}

export interface RotatedRefreshToken extends IssuedRefreshToken {
  customer: { id: string; role: Role };
}

type RotationResult =
  | { kind: "rotated"; token: RotatedRefreshToken }
  | { kind: "replay"; customerId: string; familyId: string }
  | { kind: "invalid" };

interface TokenRow {
  id: string;
  customerId: string;
  familyId: string;
  client: TokenClient;
  expiresAt: Date;
}

// Общий хвост ротации: условный claim закрывает гонку между конкурентными
// refresh-запросами; претендент, проигравший claim, получает replay.
async function rotateFrom(
  tx: Prisma.TransactionClient,
  token: TokenRow,
  customer: { id: string; role: Role },
): Promise<RotationResult> {
  const claimed = await tx.refreshToken.updateMany({
    where: { id: token.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (claimed.count === 0) {
    return {
      kind: "replay",
      customerId: token.customerId,
      familyId: token.familyId,
    };
  }

  const nextRaw = newRawToken();
  // Вся семья живёт до исходного expiresAt: ротация не продлевает сессию бесконечно.
  const successor = await tx.refreshToken.create({
    data: {
      tokenHash: hashToken(nextRaw),
      customerId: token.customerId,
      familyId: token.familyId,
      client: token.client,
      expiresAt: token.expiresAt,
    },
  });
  await tx.refreshToken.update({
    where: { id: token.id },
    data: { replacedById: successor.id },
  });

  return {
    kind: "rotated",
    token: {
      raw: nextRaw,
      expiresAt: token.expiresAt,
      customer,
    },
  };
}

export async function rotateRefreshToken(
  raw: string,
): Promise<RotatedRefreshToken> {
  const result: RotationResult = await prisma.$transaction(async (tx) => {
    const existing = await tx.refreshToken.findUnique({
      where: { tokenHash: hashToken(raw) },
      include: {
        customer: { select: { id: true, role: true, isActive: true } },
      },
    });
    if (!existing) {
      return { kind: "invalid" };
    }
    if (existing.expiresAt <= new Date() || !existing.customer.isActive) {
      return { kind: "invalid" };
    }

    const customer = { id: existing.customer.id, role: existing.customer.role };

    if (!existing.revokedAt) {
      // Обычная ротация: условный claim внутри rotateFrom закрывает гонку
      // конкурентных refresh-запросов на один и тот же токен.
      const rotated = await rotateFrom(tx, existing, customer);
      if (rotated.kind === "rotated") return rotated;
      // Claim проигран — конкурент отозвал этот токен в эти же миллисекунды;
      // решение ниже по свежести отзыва.
    }

    const revokedAt =
      existing.revokedAt ??
      (
        await tx.refreshToken.findUnique({
          where: { id: existing.id },
          select: { revokedAt: true },
        })
      )?.revokedAt;

    // Отозван только что + у семьи есть живой токен = гонка ротации
    // (пара вкладок, потерянный ответ), а не кража: продолжаем цепочку,
    // семью не отзываем.
    const withinGrace =
      revokedAt != null &&
      Date.now() - revokedAt.getTime() <= REPLAY_GRACE_MS;
    if (withinGrace) {
      for (let attempt = 0; ; attempt++) {
        const live = await tx.refreshToken.findFirst({
          where: {
            familyId: existing.familyId,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: "desc" },
        });
        if (!live) {
          if (attempt >= GRACE_FIND_RETRIES) break;
          await new Promise((resolve) => setTimeout(resolve, GRACE_FIND_BACKOFF_MS));
          continue;
        }
        const next = await rotateFrom(tx, live, customer);
        if (next.kind === "rotated") return next;
      }
    }

    return {
      kind: "replay",
      customerId: existing.customerId,
      familyId: existing.familyId,
    };
  });

  if (result.kind === "replay") {
    // Отзыв идёт после транзакции, иначе исключение откатило бы updateMany.
    await prisma.refreshToken.updateMany({
      where: { customerId: result.customerId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  if (result.kind !== "rotated") {
    throw httpError(401, "Invalid refresh token");
  }
  return result.token;
}

// Logout: отзывает всю семью предъявленного токена; неизвестный токен — no-op.
export async function revokeRefreshToken(raw: string): Promise<void> {
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(raw) },
  });
  if (!existing) {
    return;
  }
  await prisma.refreshToken.updateMany({
    where: { familyId: existing.familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// Глобальная чистка протухших токенов; revoked-но-живые строки не трогаем —
// они нужны для детекции replay до истечения expiresAt.
export async function deleteExpiredRefreshTokens(): Promise<number> {
  const { count } = await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
// Джиттер разносит прогоны нескольких инстансов; сама чистка идемпотентна.
const CLEANUP_JITTER_MS = 5 * 60 * 1000;

// Запускается один раз при старте сервера (index.ts, не в тестах).
export function startRefreshTokenCleanup(): void {
  const run = async () => {
    try {
      const count = await deleteExpiredRefreshTokens();
      if (count > 0) {
        log.info({ count }, "Expired refresh tokens deleted");
      }
    } catch (error) {
      log.error(error, "Refresh token cleanup failed");
    }
    const delay =
      CLEANUP_INTERVAL_MS + Math.floor(Math.random() * CLEANUP_JITTER_MS);
    // unref: висящий таймер не должен мешать процессу завершиться.
    setTimeout(run, delay).unref();
  };
  void run();
}
