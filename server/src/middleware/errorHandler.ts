import type { ErrorRequestHandler } from "express";
import log from "../logger.js";

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  log.error({ err }, "Unhandled error");

  if (err.name === "ZodError") {
    res.status(400).json({ error: "Validation failed", details: err.issues });
    return;
  }

  const status = (err as { status?: number }).status ?? 500;
  const message =
    status >= 500 ? "Internal server error" : err.message ?? "Request failed";
    // что бы скрыть серверную инфорацию при ошибках

  res.status(status).json({ error: message });
};

export default errorHandler;
