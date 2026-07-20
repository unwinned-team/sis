import type { Request, Response, NextFunction } from "express";
import prisma from "../prisma.js";
import { verifyAccessToken } from "../lib/jwt.js";

// Stateless-проверка access-токена — достаточно для CUSTOMER.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const payload = await verifyAccessToken(header.slice("Bearer ".length));
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

// Для публичных роутов, которым нужно лишь узнать «а это админ?»: валидный
// токен заполняет req.user, отсутствующий или битый — просто пропускает дальше.
// Никогда не отвечает 401 — иначе перестанет быть публичным.
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next();
  }

  try {
    const payload = await verifyAccessToken(header.slice("Bearer ".length));
    req.user = { id: payload.sub, role: payload.role };
  } catch {
    // Битый токен на публичном роуте — не ошибка, просто анонимный запрос.
  }
  next();
}

// Та же проверка по БД, что и в requireAdmin, но как предикат: нужна публичным
// роутам, которые лишь расширяют выдачу для админа (GET /products?includeArchived).
export async function isActiveAdmin(customerId: string): Promise<boolean> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { role: true, isActive: true },
  });
  return customer?.role === "ADMIN" && customer.isActive;
}

// Для админов stateless-доверие токену запрещено: проверка в БД на каждый
// запрос — уволенный/заблокированный админ отсекается сразу, не через 15 минут.
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.user.id },
      select: { role: true, isActive: true },
    });
    if (!customer || customer.role !== "ADMIN" || !customer.isActive) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  } catch (error) {
    next(error);
  }
}
