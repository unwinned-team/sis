import app from "./app.js";
import log from "./logger.js";
import { startRefreshTokenCleanup } from "./lib/refreshTokens.js";
import { setWebhook } from "./lib/monobank.js";
import { startPaymentVerifier } from "./workers/paymentVerifier.js";

const raw = process.env.PORT;
let port: number;

if (raw == null || raw === "") {
  port = 4000;
} else if (!/^\d+$/.test(raw) || !Number.isInteger(Number(raw))) {
  console.error(`Invalid PORT "${raw}": must be a positive integer`);
  process.exit(1);
} else {
  port = Number(raw);
}

if (port < 1 || port > 65535) {
  console.error(`PORT ${port} out of range (1-65535)`);
  process.exit(1);
}

const server = app.listen(port, () => {
  log.info(`Server running on :${port}`);
  startRefreshTokenCleanup();
  if (process.env.MONOBANK_TOKEN && process.env.MONOBANK_WEBHOOK_URL) {
    setWebhook(process.env.MONOBANK_WEBHOOK_URL).catch((error) =>
      log.error(error, "Monobank webhook registration failed"),
    );
  }
  startPaymentVerifier();
});

server.on("error", (err) => {
  log.error(err, "Server failed to start");
  process.exit(1);
});
