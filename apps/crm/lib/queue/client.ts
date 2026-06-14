import { Queue, QueueEvents } from "bullmq";
import { Redis } from "ioredis";
import { config } from "@/lib/utils/config";
import type { CampaignSendJob } from "@xeno/shared-types";

// Shared Redis connection — reused across queue and worker
// maxRetriesPerRequest: null is required by BullMQ
export const redisConnection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const campaignQueue = new Queue<CampaignSendJob>("campaign-send", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { count: 1000 }, // keep last 1000 completed jobs
    removeOnFail: { count: 500 },
  },
});

// Queue events for monitoring — used by the completion handler
export const campaignQueueEvents = new QueueEvents("campaign-send", {
  connection: new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  }),
});
