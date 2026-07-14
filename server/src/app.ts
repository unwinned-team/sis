import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import log from "./logger.js";
import apiRouter from "./routes/index.js";
import errorHandler from "./middleware/errorHandler.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on("finish", () => {
    log.info({ method: req.method, url: req.originalUrl, status: res.statusCode, ms: Date.now() - start });
  });
  next();
});

app.use("/api", apiRouter);
app.use(errorHandler);

export default app;
