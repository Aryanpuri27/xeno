import { db } from "@/lib/db/client";
import { getEmbedding } from "@/lib/utils/embeddings";
import { logger } from "@/lib/utils/logger";
import { createId } from "@paralleldrive/cuid2";
import type { AnalyticsAgentOutput } from "@/types";

export interface CampaignMemoryRecord {
  id: string;
  campaignId: string;
  summary: string;
  ctr: number;
  openRate: number;
  deliveryRate: number;
  bestChannel: string;
  audienceSize: number;
  topProduct: string;
  createdAt: Date;
  similarityScore?: number;
}

export interface CampaignStats {
  campaignName: string;
  audienceDescription: string;
  channel: string;
  totalSent: number;
  ctr: number;
  openRate: number;
  deliveryRate: number;
  topProduct: string;
}

/**
 * Retrieve top-N most semantically similar past campaigns for the current goal.
 * Uses pgvector cosine similarity search with HNSW index.
 * Returns campaigns with similarity > 0.7 (meaningfully related).
 */
export async function getCampaignMemory(
  currentGoal: string,
  limit = 3
): Promise<CampaignMemoryRecord[]> {
  const goalEmbedding = await getEmbedding(currentGoal);

  // pgvector cosine similarity search
  // <=> operator: cosine distance (lower = more similar)
  // 1 - distance = similarity score (1 = identical, -1 = opposite)
  try {
    const memories = await db.$queryRaw<CampaignMemoryRecord[]>`
      SELECT
        id, "campaignId", summary, ctr, "openRate", "deliveryRate",
        "bestChannel", "audienceSize", "topProduct", "createdAt",
        1 - (embedding <=> ${goalEmbedding}::vector) as "similarityScore"
      FROM "CampaignMemory"
      WHERE embedding IS NOT NULL
        AND 1 - (embedding <=> ${goalEmbedding}::vector) > 0.6
      ORDER BY embedding <=> ${goalEmbedding}::vector
      LIMIT ${limit}
    `;
    return memories;
  } catch {
    // Table might not have the vector column yet (pre-migration) — return empty
    logger.warn("Campaign memory query failed — embedding column may not exist yet");
    return [];
  }
}

/**
 * Write campaign learnings to memory after a campaign completes.
 * Builds a rich summary → embeds it → upserts into CampaignMemory.
 * This is the learning loop that makes each campaign smarter.
 */
export async function writeCampaignMemory(
  campaignId: string,
  stats: CampaignStats,
  analysis: AnalyticsAgentOutput
): Promise<void> {
  const summary = buildMemorySummary(stats, analysis);

  let embedding: number[];
  try {
    embedding = await getEmbedding(summary);
  } catch (err) {
    logger.error({ campaignId, err }, "Failed to generate embedding for campaign memory");
    return;
  }

  const id = createId();

  try {
    await db.$executeRaw`
      INSERT INTO "CampaignMemory" (
        id, "campaignId", summary, ctr, "openRate", "deliveryRate",
        "bestChannel", "audienceSize", "topProduct", embedding, "createdAt"
      ) VALUES (
        ${id}, ${campaignId}, ${summary},
        ${stats.ctr}, ${stats.openRate}, ${stats.deliveryRate},
        ${stats.channel}, ${stats.totalSent}, ${stats.topProduct},
        ${embedding}::vector, NOW()
      )
      ON CONFLICT ("campaignId")
      DO UPDATE SET
        summary = EXCLUDED.summary,
        ctr = EXCLUDED.ctr,
        "openRate" = EXCLUDED."openRate",
        "deliveryRate" = EXCLUDED."deliveryRate",
        embedding = EXCLUDED.embedding
    `;
    logger.info({ campaignId }, "Campaign memory written");
  } catch (err) {
    logger.error({ campaignId, err }, "Failed to write campaign memory to pgvector");
  }
}

function buildMemorySummary(stats: CampaignStats, analysis: AnalyticsAgentOutput): string {
  return (
    `Campaign "${stats.campaignName}" targeted ${stats.audienceDescription}. ` +
    `Audience size: ${stats.totalSent} customers. Channel: ${stats.channel}. ` +
    `CTR: ${stats.ctr.toFixed(1)}%. Open rate: ${stats.openRate.toFixed(1)}%. ` +
    `Delivery rate: ${stats.deliveryRate.toFixed(1)}%. ` +
    `Top product: ${stats.topProduct}. ` +
    `AI verdict: ${analysis.summary}`
  );
}
