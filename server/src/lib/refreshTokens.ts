import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Role, TokenClient } from "@prisma/client";
import prisma from "../prisma.js";
import log from "../logger.js";
import { httpError } from "./httpError.js";

// У админа короткая сессия: наступил новый день — логинится заново.
const CUSTOMER_REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ADMIN_REFRESH_TTL_MS = 12 * 60 * 60 * 1000;

export function refreshTokenTtlMs(role: Role): number {
  return role === "ADMIN" ? ADMIN_REFRESH_TTL_MS : CUSTOMER_REFRESH_TTL_MS;
}

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
    data: { tokenHash: hashToken(raw), customerId, familyId: randomUUID(), client, expiresAt },
  });
  return { raw, expiresAt };
}

export interface RotatedRefreshToken extends IssuedRefreshToken {
  customer: { id: string; role: Role };
}

export async function rotateRefreshToken(raw: string): Promise<RotatedRefreshToken> {
  // Проверки и реплей-отзыв идут вне транзакции: throw внутри
  // prisma.$transaction откатил бы и сам массовый отзыв токенов.
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { customer: { select: { id: true, role: true, isActive: true } } },
  });
  if (!existing) {
    throw httpError(401, "Invalid refresh token");
  }
  if (existing.expiresAt <= new Date()) {
    throw httpError(401, "Invalid refresh token");
  }
  if (existing.revokedAt) {
    // Реплей «сгоревшего» токена = признак кражи: выкидываем пользователя
    // из системы на всех устройствах, дальше только логин по паролю.
    await prisma.refreshToken.updateMany({
      where: { customerId: existing.customerId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    log.warn(
      { customerId: existing.customerId, familyId: existing.familyId },
      "Refresh token replay detected; all sessions revoked",
    );
    throw httpError(401, "Invalid refresh token");
  }
  if (!existing.customer.isActive) {
    throw httpError(401, "Invalid refresh token");
  }

  return prisma.$transaction(async (tx) => {
    // updateMany с условием revokedAt: null — защита от двойной ротации
    // конкурентными запросами (проигравший получает 401, не мутируя семью).
    const claimed = await tx.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw httpError(401, "Invalid refresh token");
    }

    const nextRaw = newRawToken();
    const expiresAt = new Date(Date.now() + refreshTokenTtlMs(existing.customer.role));
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
      raw: nextRaw,
      expiresAt,
      customer: { id: existing.customer.id, role: existing.customer.role },
    };
  });
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

// Чистка протухших токенов пользователя при логине (без cron).
export async function deleteExpiredRefreshTokens(customerId: string): Promise<void> {
  await prisma.refreshToken.deleteMany({
    where: { customerId, expiresAt: { lt: new Date() } },
  });
}
