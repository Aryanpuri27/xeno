import express from "express";
import { pinoHttp } from "pino-http";
import { logger } from "./utils/logger";
import { sendRouter } from "./routes/send";

const app = express();
const PORT = process.env.PORT ?? 4000;

app.use(pinoHttp({ logger }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "channel-service", timestamp: new Date().toISOString() });
});

app.use("/", sendRouter);

app.listen(PORT, () => {
  logger.info(`🚀 Channel service running on port ${PORT}`);
});

export default app;
