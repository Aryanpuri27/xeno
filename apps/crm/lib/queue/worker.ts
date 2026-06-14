/**
 * BullMQ Worker — runs as a STANDALONE Node.js process (not inside Next.js).
 * Start with: pnpm worker (or tsx --env-file .env lib/queue/worker.ts)
 *
 * Debug logging is ON by default. Every job logs:
 *   [WORKER] job picked up → [WORKER] Communication created → [WORKER] Channel service called
 *   → [WORKER] Job done  OR  [WORKER] Job FAILED
 */

import { Worker, UnrecoverableError } from "bullmq";
import { Redis } from "ioredis";
import { createId } from "@paralleldrive/cuid2";
import { config } from "@/lib/utils/config";
import { logger } from "@/lib/utils/logger";
import { db } from "@/lib/db/client";
import { handleCampaignCompletion } from "./jobs/campaign-completion";
import { startStaleSweep } from "./jobs/stale-sweep";
import type { CampaignSendJob } from "@xeno/shared-types";

const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

async function checkIdempotency(key: string): Promise<boolean> {
  const result = await redis.get(`idem:${key}`);
  return result !== null;
}

async function markIdempotencySeen(key: string): Promise<void> {
  await redis.set(`idem:${key}`, "1", "EX", 86400);
}

/**
 * Full send flow with step-by-step logging:
 *  1. Create Communication row in DB
 *  2. POST to channel service
 *  3. Channel service schedules callbacks → fires webhook → updates DB
 */
async function callChannelService(job: CampaignSendJob): Promise<string> {
  const webhookUrl = `${config.WEBHOOK_BASE_URL}/api/webhook/receipt`;

  // Step 1 — Create Communication record so webhook has something to update
  const communication = await db.communication.create({
    data: {
      id: createId(),
      campaignId: job.campaignId,
      customerId: job.customerId,
      channel: job.channel,
      status: "SENT",
    },
  });

  logger.info({
    step: "communication_created",
    communicationId: communication.id,
    campaignId: job.campaignId,
    customerId: job.customerId,
    channel: job.channel,
  }, "[WORKER] Communication record created in DB");

  // Step 2 — Call channel service
  const payload = {
    communicationId: communication.id,
    campaignId: job.campaignId,
    customerId: job.customerId,
    channel: job.channel,
    message: job.message,
    subject: job.subject,
    webhookUrl,
  };

  logger.info({
    step: "calling_channel_service",
    url: `${config.CHANNEL_SERVICE_URL}/send`,
    communicationId: communication.id,
    channel: job.channel,
  }, "[WORKER] Calling channel service");

  let response: Response;
  try {
    response = await fetch(`${config.CHANNEL_SERVICE_URL}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (fetchErr) {
    logger.error({
      step: "channel_service_fetch_failed",
      communicationId: communication.id,
      url: `${config.CHANNEL_SERVICE_URL}/send`,
      err: fetchErr,
    }, "[WORKER] ❌ Could not reach channel service — is it running on port 4000?");
    throw fetchErr;
  }

  const responseBody = await response.text();

  if (response.status >= 400 && response.status < 500) {
    logger.error({
      step: "channel_service_4xx",
      status: response.status,
      body: responseBody,
      communicationId: communication.id,
    }, "[WORKER] ❌ Channel service rejected (4xx) — not retrying");
    throw new UnrecoverableError(`Channel service 4xx: ${response.status} ${responseBody}`);
  }

  if (!response.ok) {
    logger.error({
      step: "channel_service_5xx",
      status: response.status,
      body: responseBody,
      communicationId: communication.id,
    }, "[WORKER] ❌ Channel service error (5xx) — will retry");
    throw new Error(`Channel service ${response.status}: ${responseBody}`);
  }

  logger.info({
    step: "channel_service_accepted",
    communicationId: communication.id,
    responseBody,
  }, "[WORKER] ✅ Channel service accepted — callbacks will fire via webhook");

  return communication.id;
}

const worker = new Worker<CampaignSendJob>(
  "campaign-send",
  async (job) => {
    const { campaignId, customerId, channel, idempotencyKey } = job.data;

    logger.info({
      step: "job_picked_up",
      jobId: job.id,
      campaignId,
      customerId,
      channel,
      idempotencyKey,
    }, "[WORKER] Job picked up from queue");

    const alreadySent = await checkIdempotency(idempotencyKey);
    if (alreadySent) {
      logger.info({ jobId: job.id, idempotencyKey }, "[WORKER] Duplicate — skipping (idempotency)");
      return;
    }

    const communicationId = await callChannelService(job.data);
    await markIdempotencySeen(idempotencyKey);

    logger.info({
      step: "job_done",
      jobId: job.id,
      campaignId,
      customerId,
      channel,
      communicationId,
    }, "[WORKER] ✅ Job complete");

    handleCampaignCompletion(campaignId).catch((err) =>
      logger.error({ campaignId, err }, "[WORKER] Campaign completion handler failed")
    );
  },
  {
    connection: new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    }),
    concurrency: 20,
    limiter: { max: 100, duration: 1000 },
  }
);

worker.on("failed", (job, err) => {
  logger.error(
    { jobId: job?.id, campaignId: job?.data.campaignId, err },
    "[WORKER] ❌ Job failed permanently (exhausted retries)"
  );
});

worker.on("error", (err) => {
  logger.error({ err }, "[WORKER] Worker-level error");
});

logger.info({
  channelServiceUrl: config.CHANNEL_SERVICE_URL,
  webhookBaseUrl: config.WEBHOOK_BASE_URL,
  redisUrl: config.REDIS_URL,
}, "[WORKER] Campaign send worker started (concurrency: 20)");

// Start stale communication sweep — recovers from lost callbacks on restart
const sweepTimer = startStaleSweep();

process.on("SIGTERM", async () => {
  clearInterval(sweepTimer);
  await worker.close();
  await redis.quit();
  logger.info("[WORKER] Shut down gracefully");
  process.exit(0);
});
