import { db } from "@/lib/db/client";
import { logger } from "@/lib/utils/logger";
import { createId } from "@paralleldrive/cuid2";
import { handleCampaignCompletion } from "../jobs/campaign-completion";

const STALE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes — safe margin above max callback delay
const SWEEP_INTERVAL_MS  = 30 * 1000;     // check every 30 seconds

/**
 * Stale communication sweep.
 *
 * Problem: the channel service uses in-memory setTimeout for callbacks.
 * If the process restarts (crash, kill, redeploy), those timers are lost.
 * The Communication row stays in "SENT" forever, blocking campaign completion.
 *
 * Fix: periodically find any Communication stuck in SENT for >2 minutes,
 * mark it FAILED, create the matching event, then re-check campaign completion.
 *
 * Why 2 minutes? The longest callback delay is 60 seconds (CONVERTED),
 * so anything still in SENT after 2 minutes definitely lost its callback.
 */
export function startStaleSweep(): NodeJS.Timeout {
  logger.info(
    { sweepIntervalSec: SWEEP_INTERVAL_MS / 1000, thresholdSec: STALE_THRESHOLD_MS / 1000 },
    "[SWEEP] Stale communication sweep started"
  );

  return setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);

      // Find all communications stuck in SENT beyond the threshold
      const stale = await db.communication.findMany({
        where: {
          status: "SENT",
          createdAt: { lt: cutoff },
        },
        select: { id: true, campaignId: true },
      });

      if (stale.length === 0) return;

      logger.warn(
        { count: stale.length, cutoff },
        `[SWEEP] Found ${stale.length} stale SENT communication(s) — marking FAILED`
      );

      // Mark each one FAILED and create a CommunicationEvent row
      await db.$transaction(
        stale.flatMap(({ id }) => [
          db.communication.update({
            where: { id },
            data: { status: "FAILED", updatedAt: new Date() },
          }),
          db.communicationEvent.create({
            data: {
              id: createId(),
              communicationId: id,
              eventType: "FAILED",
              timestamp: new Date(),
            },
          }),
        ])
      );

      logger.info(
        { count: stale.length },
        "[SWEEP] Marked stale communications as FAILED"
      );

      // Re-check completion for every affected campaign
      const uniqueCampaignIds = [...new Set(stale.map((c) => c.campaignId))];
      for (const campaignId of uniqueCampaignIds) {
        await handleCampaignCompletion(campaignId);
      }
    } catch (err) {
      logger.error({ err }, "[SWEEP] Stale sweep failed — will retry next interval");
    }
  }, SWEEP_INTERVAL_MS);
}
