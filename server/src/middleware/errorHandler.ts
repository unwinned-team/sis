import type { ErrorRequestHandler } from "express";
import log from "../logger.js";

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  log.error({ err }, "Unhandled error");

  if (err.name === "ZodError") {
    res.status(400).json({ error: "Validation failed", details: err.issues });
    return;
  }

  const status = (err as { status?: number }).status ?? 500;
  res.status(status).json({ error: err.message ?? "Internal server error" });
};

export default errorHandler;
