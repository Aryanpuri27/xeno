import pino from "pino";

/**
 * Logger — avoids pino-pretty's worker thread on Windows with pnpm.
 * The worker thread resolves to C:\ROOT\node_modules which doesn't exist.
 * Fix: use pino.destination (sync stdout) in dev instead of pino-pretty transport.
 */
export const logger = pino(
  { level: process.env.NODE_ENV === "production" ? "info" : "debug" },
  process.env.NODE_ENV !== "production"
    ? pino.destination({ sync: true }) // sync stdout — no worker threads
    : pino.destination(1)              // fd 1 = stdout in production
);
