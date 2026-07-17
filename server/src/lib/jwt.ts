import "dotenv/config";
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@prisma/client";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

const secret = process.env.JWT_ACCESS_SECRET;

if (!secret || secret.length < 32) {
  throw new Error("JWT_ACCESS_SECRET is required and must be at least 32 characters");
}

const key = new TextEncoder().encode(secret);

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(key);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
  if (typeof payload.sub !== "string" || (payload.role !== "CUSTOMER" && payload.role !== "ADMIN")) {
    throw new Error("Invalid access token payload");
  }
  return { sub: payload.sub, role: payload.role };
}
