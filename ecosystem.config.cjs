// pm2 конфиг для деплоя на VPS (pm2 + nginx).
//   pm2 start ecosystem.config.cjs --env production
//
// ВАЖНО: cwd обязателен и обязан указывать на server/. От process.cwd()
// зависят четыре вещи, и запуск из корня репозитория ломает все сразу:
//   1. dotenv/config ищет .env         (server/src/prisma.ts)
//   2. multer пишет в "uploads/"       (server/src/middleware/upload.ts)
//   3. path.resolve("uploads")         (server/src/routes/images.ts)
//   4. express.static("uploads")       (server/src/app.ts)
// Без cwd сервер не поднимется вообще — не найдёт DATABASE_URL.
const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "ice-shop-api",
      cwd: path.join(__dirname, "server"),
      script: "dist/index.js",

      // Только один инстанс. В cluster mode каждый форк поднимает свой
      // startPaymentVerifier(), а выписка monobank лимитирована 1 req/60s на
      // токен — N инстансов = постоянные 429 и подтверждение оплат встаёт.
      // Записи в БД при этом безопасны (условные updateMany), ломается
      // именно внешний лимит. Нужен рост — вынести воркеры отдельным
      // единичным процессом, а API уже клстеризовать.
      instances: 1,
      exec_mode: "fork",

      env_production: {
        NODE_ENV: "production",
        PORT: 4000,
        // nginx — один прокси-хоп. Иначе req.ip = 127.0.0.1 и в
        // AgeVerification пишется адрес прокси, а не покупателя.
        TRUST_PROXY_HOPS: 1,
      },

      autorestart: true,
      max_restarts: 10,
      // Рестарт при утечке; обычный расход сильно ниже.
      max_memory_restart: "512M",
      // .env читает сам процесс (dotenv), pm2 его не парсит — секреты
      // остаются в server/.env с правами 600.
      time: true,
      merge_logs: true,
      error_file: "../logs/api-error.log",
      out_file: "../logs/api-out.log",
    },
  ],
};
