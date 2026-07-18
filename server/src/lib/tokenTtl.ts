import type { Role } from "@prisma/client";

const CUSTOMER_REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ADMIN_REFRESH_TTL_MS = 12 * 60 * 60 * 1000;

export function refreshTokenTtlMs(role: Role): number {
  return role === "ADMIN" ? ADMIN_REFRESH_TTL_MS : CUSTOMER_REFRESH_TTL_MS;
}
