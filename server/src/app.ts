import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import log from "./logger.js";
import apiRouter from "./routes/index.js";
import errorHandler from "./middleware/errorHandler.js";

const app = express();

// credentials: true — браузер шлёт/принимает refresh-cookie только при
// явном origin (wildcard с credentials запрещён спекой CORS).
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on("finish", () => {
    log.info({ method: req.method, url: req.originalUrl, status: res.statusCode, ms: Date.now() - start });
  });
  next();
});

app.use("/api/v1", apiRouter);
app.use(errorHandler);

export default app;
