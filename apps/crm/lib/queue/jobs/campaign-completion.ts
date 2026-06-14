import { db } from "@/lib/db/client";
import { logger } from "@/lib/utils/logger";

/**
 * Called after each job completes to check if the entire campaign is done.
 * If all communications are in a terminal state, updates campaign status to COMPLETED
 * and triggers the analytics agent (which writes to campaign memory — the learning loop).
 */
export async function handleCampaignCompletion(campaignId: string): Promise<void> {
  const pendingCount = await db.communication.count({
    where: {
      campaignId,
      status: { notIn: ["DELIVERED", "OPENED", "CLICKED", "CONVERTED", "FAILED", "BOUNCED"] },
    },
  });

  if (pendingCount > 0) return; // not done yet

  // Check if it was already marked completed (avoid double-processing)
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { status: true },
  });

  if (!campaign || campaign.status === "COMPLETED") return;

  await db.campaign.update({
    where: { id: campaignId },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  logger.info({ campaignId }, "Campaign completed — all messages processed");

  // Analytics agent and memory write-back are triggered from the analytics API endpoint
  // Not triggered here to keep the worker lightweight
}
