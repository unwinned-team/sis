import type { ErrorRequestHandler } from "express";
import { Prisma } from "@prisma/client";
import multer from "multer";
import log from "../logger.js";

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    res.status(409).json({ error: "A unique value already exists" });
    return;
  }

  if (err instanceof multer.MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    res.status(status).json({ error: err.message });
    return;
  }

  const status = (err as { status?: number }).status ?? 500;
  if (status >= 500) {
    log.error({ err }, "Unhandled error");
  } else {
    log.info({ status, message: err.message }, "Request failed");
  }
  const message =
    status >= 500 ? "Internal server error" : err.message ?? "Request failed";
    // что бы скрыть серверную инфорацию при ошибках

  // details отдаём только на 4xx и отдельным полем: spread мог бы перезаписать
  // "error", а на 5xx — раскрыть внутренности, которые message уже скрывает.
  const details = status < 500 ? (err as { details?: unknown }).details : undefined;
  res.status(status).json(details !== undefined ? { error: message, details } : { error: message });
};

export default errorHandler;
