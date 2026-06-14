import { ai, AI_MODELS } from "@/lib/utils/ai-client";
import { logger } from "@/lib/utils/logger";
import { writeCampaignMemory } from "@/lib/memory/campaign";
import { z } from "zod";
import type { AnalyticsAgentOutput, AnalyticsSnapshot } from "@/types";

interface ChannelBenchmarks {
  channel: string;
  avgOpenRate: number;
  avgCtr: number;
  avgDeliveryRate: number;
}

const CHANNEL_BENCHMARKS: Record<string, ChannelBenchmarks> = {
  whatsapp: { channel: "whatsapp", avgOpenRate: 0.72, avgCtr: 0.18, avgDeliveryRate: 0.88 },
  email: { channel: "email", avgOpenRate: 0.28, avgCtr: 0.08, avgDeliveryRate: 0.72 },
  sms: { channel: "sms", avgOpenRate: 0.45, avgCtr: 0.06, avgDeliveryRate: 0.80 },
  rcs: { channel: "rcs", avgOpenRate: 0.55, avgCtr: 0.12, avgDeliveryRate: 0.75 },
};

const AnalyticsOutputSchema = z.object({
  summary: z.string(),
  insights: z.array(z.string()).min(1).max(7),
  recommendations: z.array(z.string()).min(1).max(5),
  performanceVsBenchmark: z.enum(["above", "below", "at", "insufficient_data"]),
});

/**
 * Analytics Agent — post-campaign performance analysis.
 * Analyzes real stats, generates natural language insights, and
 * triggers the memory write-back (learning loop).
 */
export async function runAnalyticsAgent(
  campaignId: string,
  stats: AnalyticsSnapshot & { campaignName: string; audienceDescription: string; topProduct: string; channel: string }
): Promise<AnalyticsAgentOutput> {
  const benchmarks = CHANNEL_BENCHMARKS[stats.channel] ?? CHANNEL_BENCHMARKS["email"]!;


  const response = await ai.chat.completions.create({
    model: AI_MODELS.large,
    temperature: 0.3, // specific but readable
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a Nike CRM marketing analytics expert.
Analyze campaign performance and generate actionable, specific insights.
Always mention actual numbers. Never use vague language.
Output JSON:
{
  "summary": string (1 sentence overall verdict with key metric),
  "insights": string[] (3-5 specific findings with actual numbers),
  "recommendations": string[] (2-3 actionable next steps for Nike),
  "performanceVsBenchmark": "above" | "below" | "at" | "insufficient_data"
}`,
      },
      {
        role: "user",
        content: `Campaign stats:\n${JSON.stringify(stats, null, 2)}\n\nChannel benchmarks:\n${JSON.stringify(benchmarks, null, 2)}\n\nAnalyze this Nike campaign's performance.`,
      },
    ],
  });

  const analysis = AnalyticsOutputSchema.parse(
    JSON.parse(response.choices[0]?.message.content ?? "{}")
  );

  // Trigger memory write-back — this is the learning loop
  // Fire and forget — don't block analytics display on this
  writeCampaignMemory(
    campaignId,
    {
      campaignName: stats.campaignName,
      audienceDescription: stats.audienceDescription,
      channel: stats.channel,
      totalSent: stats.totalSent,
      ctr: stats.ctr,
      openRate: stats.openRate,
      deliveryRate: stats.deliveryRate,
      topProduct: stats.topProduct,
    },
    analysis
  ).catch((err) => logger.error({ campaignId, err }, "Failed to write campaign memory"));

  return analysis;
}
