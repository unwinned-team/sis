import app from "./app.js";
import log from "./logger.js";

const port = Number(process.env.PORT ?? "4000");

app.listen(port, () => {
  log.info(`Server running on :${port}`);
});
