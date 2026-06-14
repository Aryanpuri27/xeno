import { Queue, QueueEvents } from "bullmq";
import { Redis } from "ioredis";
import { config } from "@/lib/utils/config";
import type { CampaignSendJob } from "@xeno/shared-types";

// Shared Redis connection helper to prevent build-time instantiation
let _redisConnection: Redis | null = null;
function getRedisConnection(): Redis {
  if (!_redisConnection) {
    _redisConnection = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return _redisConnection;
}

let _campaignQueue: Queue<CampaignSendJob> | null = null;
export function getCampaignQueue(): Queue<CampaignSendJob> {
  if (!_campaignQueue) {
    _campaignQueue = new Queue<CampaignSendJob>("campaign-send", {
      connection: getRedisConnection() as any,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { count: 1000 }, // keep last 1000 completed jobs
        removeOnFail: { count: 500 },
      },
    });
  }
  return _campaignQueue;
}

let _campaignQueueEvents: QueueEvents | null = null;
export function getCampaignQueueEvents(): QueueEvents {
  if (!_campaignQueueEvents) {
    _campaignQueueEvents = new QueueEvents("campaign-send", {
      connection: new Redis(config.REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      }) as any,
    });
  }
  return _campaignQueueEvents;
}
