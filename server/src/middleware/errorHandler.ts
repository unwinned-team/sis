import type { ErrorRequestHandler } from "express";
import { Prisma } from "@prisma/client";
import log from "../logger.js";

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    res.status(409).json({ error: "A unique value already exists" });
    return;
  }

  const status = (err as { status?: number }).status ?? 500;
  if (status >= 500) {
    log.error({ err }, "Unhandled error");
  }
  const message =
    status >= 500 ? "Internal server error" : err.message ?? "Request failed";
    // что бы скрыть серверную инфорацию при ошибках

  const payload =
    status < 500 ? (err as { payload?: Record<string, unknown> }).payload : undefined;

  res.status(status).json({ error: message, ...payload });
};

export default errorHandler;
