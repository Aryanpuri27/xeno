import { ai, AI_MODELS } from "@/lib/utils/ai-client";
import { db } from "@/lib/db/client";
import { z } from "zod";
import type { ChannelAgentOutput, ChannelPerformance } from "@/types";

const ChannelRecommendationSchema = z.object({
  recommendedChannel: z.enum(["whatsapp", "email", "sms", "rcs"]),
  confidenceScore: z.number().min(0).max(1),
  reasoning: z.string(),
});

/**
 * Channel Agent — recommends the best channel based on REAL historical performance data.
 * NOT a random recommendation — it reads actual analytics from the DB and uses
 * gpt-4o-mini to reason over the numbers and make a data-driven recommendation.
 */
export async function runChannelAgent(audienceDescription: string): Promise<ChannelAgentOutput> {
  // Step 1: Get real performance data from past campaigns
  // Aggregated from communication_events — one query, not N counts
  let channelStats: ChannelPerformance[] = [];

  try {
    channelStats = await db.$queryRaw<ChannelPerformance[]>`
      SELECT
        comm.channel,
        AVG(CASE WHEN ce."eventType" = 'OPENED'    THEN 1.0 ELSE 0.0 END)::float AS "avgOpenRate",
        AVG(CASE WHEN ce."eventType" = 'CLICKED'   THEN 1.0 ELSE 0.0 END)::float AS "avgCtr",
        AVG(CASE WHEN ce."eventType" = 'DELIVERED' THEN 1.0 ELSE 0.0 END)::float AS "avgDeliveryRate",
        COUNT(DISTINCT comm.id)::int                                               AS "sampleSize"
      FROM "Communication" comm
      LEFT JOIN "CommunicationEvent" ce ON ce."communicationId" = comm.id
      GROUP BY comm.channel
      HAVING COUNT(DISTINCT comm.id) > 5
      ORDER BY "avgCtr" DESC
    `;
  } catch {
    // No data yet — return sensible default
  }

  // Step 2: If no historical data (new brand, no past campaigns)
  if (channelStats.length === 0) {
    return {
      recommendedChannel: "email",
      confidenceScore: 0.5,
      reasoning:
        "No historical campaign data available yet. Defaulting to email — widely supported and trackable. " +
        "After your first campaign, the channel agent will use real performance data.",
      channelStats: [],
    };
  }

  // Step 3: Ask gpt-4o-mini to reason over real numbers and make a recommendation
  // The LLM is interpreting real data, not guessing
  const response = await ai.chat.completions.create({
    model: AI_MODELS.fast,
    temperature: 0, // data-driven, not creative
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a CRM channel optimization expert for Nike.
Given real performance data from past campaigns, recommend the best channel.
Output JSON: { "recommendedChannel": "whatsapp"|"email"|"sms"|"rcs", "confidenceScore": number 0-1, "reasoning": string }`,
      },
      {
        role: "user",
        content: `Audience: ${audienceDescription}\nChannel performance data:\n${JSON.stringify(channelStats, null, 2)}\nWhich channel should we use for this campaign and why?`,
      },
    ],
  });

  const recommendation = ChannelRecommendationSchema.parse(
    JSON.parse(response.choices[0]?.message.content ?? "{}")
  );

  return { ...recommendation, channelStats };
}
