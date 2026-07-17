import type { CookieOptions, Request, Response, NextFunction } from "express";
import { Router } from "express";
import type { Prisma, Role, TokenClient } from "@prisma/client";
import prisma from "../prisma.js";
import { httpError } from "../lib/httpError.js";
import { hashPassword, verifyPassword, DUMMY_HASH } from "../lib/password.js";
import { signAccessToken } from "../lib/jwt.js";
import {
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  deleteExpiredRefreshTokens,
  type IssuedRefreshToken,
} from "../lib/refreshTokens.js";
import { requireAuth } from "../middleware/auth.js";
import { registerSchema, loginSchema, mobileRefreshSchema } from "../schemas/auth.js";

const router = Router();

export const REFRESH_COOKIE_NAME = "refreshToken";

// path ограничен auth-роутами, чтобы cookie не ездила с обычными запросами.
const REFRESH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  sameSite: "strict",
  secure: process.env.NODE_ENV === "production",
  path: "/api/v1/auth",
};

interface PublicUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  bonusBalance: Prisma.Decimal;
  createdAt: Date;
}

function toPublicUser(customer: PublicUser): PublicUser {
  const { id, name, email, phone, role, bonusBalance, createdAt } = customer;
  return { id, name, email, phone, role, bonusBalance, createdAt };
}

// Web и mobile различаются только доставкой refresh-токена:
// web — HttpOnly-cookie, mobile — поле в JSON (Keychain/Keystore).
function sendTokens(
  res: Response,
  status: number,
  client: TokenClient,
  refresh: IssuedRefreshToken,
  body: { user?: PublicUser; accessToken: string },
) {
  if (client === "WEB") {
    res.cookie(REFRESH_COOKIE_NAME, refresh.raw, {
      ...REFRESH_COOKIE_OPTIONS,
      maxAge: refresh.expiresAt.getTime() - Date.now(),
    });
    res.status(status).json(body);
  } else {
    res.status(status).json({ ...body, refreshToken: refresh.raw });
  }
}

// POST /api/v1/auth/{web,mobile}/register
function registerHandler(client: TokenClient) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ errors: parsed.error.issues });
      }

      const { name, email, password } = parsed.data;
      const passwordHash = await hashPassword(password);
      // Дубликат email (P2002) уходит в errorHandler -> 409.
      const customer = await prisma.customer.create({ data: { name, email, passwordHash } });

      const accessToken = await signAccessToken({ sub: customer.id, role: customer.role });
      const refresh = await issueRefreshToken(customer.id, client, customer.role);
      sendTokens(res, 201, client, refresh, { user: toPublicUser(customer), accessToken });
    } catch (error) {
      next(error);
    }
  };
}

// POST /api/v1/auth/{web,mobile}/login
function loginHandler(client: TokenClient) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ errors: parsed.error.issues });
      }

      const { email, password } = parsed.data;
      const customer = await prisma.customer.findUnique({
        where: { email },
        omit: { passwordHash: false },
      });

      // Единый код-путь для всех отказов (нет юзера / нет пароля / неверный
      // пароль / заблокирован): DUMMY_HASH выравнивает время ответа, единый
      // 401 не раскрывает, что именно не так.
      const passwordMatches = await verifyPassword(password, customer?.passwordHash ?? DUMMY_HASH);
      if (!customer || !customer.passwordHash || !passwordMatches || !customer.isActive) {
        throw httpError(401, "Invalid credentials");
      }

      await deleteExpiredRefreshTokens(customer.id);

      const accessToken = await signAccessToken({ sub: customer.id, role: customer.role });
      const refresh = await issueRefreshToken(customer.id, client, customer.role);
      sendTokens(res, 200, client, refresh, { user: toPublicUser(customer), accessToken });
    } catch (error) {
      next(error);
    }
  };
}

// POST /api/v1/auth/web/refresh
async function webRefresh(req: Request, res: Response, next: NextFunction) {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME];
    if (typeof raw !== "string" || raw === "") {
      throw httpError(401, "Invalid refresh token");
    }

    const rotated = await rotateRefreshToken(raw).catch((error) => {
      // Токен мёртв (реплей/просрочка/отзыв) — чистим cookie, чтобы браузер
      // не предъявлял его снова.
      res.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
      throw error;
    });

    const accessToken = await signAccessToken({ sub: rotated.customer.id, role: rotated.customer.role });
    sendTokens(res, 200, "WEB", rotated, { accessToken });
  } catch (error) {
    next(error);
  }
}

// POST /api/v1/auth/mobile/refresh
async function mobileRefresh(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = mobileRefreshSchema.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(401, "Invalid refresh token");
    }

    const rotated = await rotateRefreshToken(parsed.data.refreshToken);
    const accessToken = await signAccessToken({ sub: rotated.customer.id, role: rotated.customer.role });
    sendTokens(res, 200, "MOBILE", rotated, { accessToken });
  } catch (error) {
    next(error);
  }
}

// POST /api/v1/auth/logout — общий для web и mobile, идемпотентный.
async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const fromCookie = req.cookies?.[REFRESH_COOKIE_NAME];
    const fromBody = req.body?.refreshToken;
    const raw = typeof fromCookie === "string" && fromCookie !== "" ? fromCookie : fromBody;

    if (typeof raw === "string" && raw !== "") {
      await revokeRefreshToken(raw);
    }

    res.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

// GET /api/v1/auth/me
async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.user!.id },
    });
    if (!customer) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    res.json(toPublicUser(customer));
  } catch (error) {
    next(error);
  }
}

router.post("/web/register", registerHandler("WEB"));
router.post("/mobile/register", registerHandler("MOBILE"));
router.post("/web/login", loginHandler("WEB"));
router.post("/mobile/login", loginHandler("MOBILE"));
router.post("/web/refresh", webRefresh);
router.post("/mobile/refresh", mobileRefresh);
router.post("/logout", logout);
router.get("/me", requireAuth, getMe);

export default router;
