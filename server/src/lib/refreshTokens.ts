import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Role, TokenClient } from "@prisma/client";
import prisma from "../prisma.js";
import log from "../logger.js";
import { httpError } from "./httpError.js";
import { refreshTokenTtlMs } from "./tokenTtl.js";

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
  role: Role,
): Promise<IssuedRefreshToken> {
  const raw = newRawToken();
  const expiresAt = new Date(Date.now() + refreshTokenTtlMs(role));
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
    if (existing.revokedAt) {
      return {
        kind: "replay",
        customerId: existing.customerId,
        familyId: existing.familyId,
      };
    }
    if (existing.expiresAt <= new Date() || !existing.customer.isActive) {
      return { kind: "invalid" };
    }

    // Условный update закрывает гонку между конкурентными refresh-запросами.
    const claimed = await tx.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count === 0) {
      return {
        kind: "replay",
        customerId: existing.customerId,
        familyId: existing.familyId,
      };
    }

    const nextRaw = newRawToken();
    // Вся семья живёт до исходного expiresAt: ротация не продлевает сессию бесконечно.
    const expiresAt = existing.expiresAt;
    const successor = await tx.refreshToken.create({
      data: {
        tokenHash: hashToken(nextRaw),
        customerId: existing.customerId,
        familyId: existing.familyId,
        client: existing.client,
        expiresAt,
      },
    });
    await tx.refreshToken.update({
      where: { id: existing.id },
      data: { replacedById: successor.id },
    });

    return {
      kind: "rotated",
      token: {
        raw: nextRaw,
        expiresAt,
        customer: { id: existing.customer.id, role: existing.customer.role },
      },
    };
  });

  if (result.kind === "replay") {
    // Отзыв идёт после транзакции, иначе исключение откатило бы updateMany.
    await prisma.refreshToken.updateMany({
      where: { customerId: result.customerId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    log.warn(
      { customerId: result.customerId, familyId: result.familyId },
      "Refresh token replay detected; all sessions revoked",
    );
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
