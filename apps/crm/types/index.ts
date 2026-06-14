// CRM-internal domain types
// Import from @xeno/shared-types for types shared with channel-service

import type { BrandMemory } from "@/lib/memory/brand";
import type { CampaignMemoryRecord } from "@/lib/memory/campaign";

export type { BrandMemory, CampaignMemoryRecord };

// ── Orchestrator ──────────────────────────────────────────────────────────────

export interface OrchestratorContext {
  runId: string;
  brandMemory: BrandMemory;
  campaignMemories: CampaignMemoryRecord[];
  brandName: string;
}

export interface ExecutionPlan {
  segmentDescription: string;
  segmentSQL: string;
  audienceCount: number;
  sampleCustomers: Array<{ id: string; name: string; email: string }>;
  recommendedChannel: "whatsapp" | "email" | "sms" | "rcs";
  channelConfidence: number;
  products: Array<{ id: string; name: string; category: string; price: number }>;
  messageDraft: string;
  subject?: string;
  cta: string;
  estimatedReach: number;
}

// ── Agent outputs ─────────────────────────────────────────────────────────────

export interface SegmentAgentOutput {
  sql: string;
  description: string;
  inferredCategory: string;
  count: number;
  sample: Array<{ id: string; name: string; email: string; lastOrderDate?: string }>;
  estimatedReach: number;
  warning?: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string;
}

export interface ProductAgentOutput {
  primaryProducts: Product[];
  crossSellSuggestions: Product[];
  upsellSuggestions: Product[];
}

export interface ContentAgentOutput {
  subject?: string;
  headline: string;
  body: string;
  cta: string;
  characterCount: number;
}

export interface ChannelAgentOutput {
  recommendedChannel: "whatsapp" | "email" | "sms" | "rcs";
  confidenceScore: number;
  reasoning: string;
  channelStats: ChannelPerformance[];
}

export interface ChannelPerformance {
  channel: string;
  avgOpenRate: number;
  avgCtr: number;
  avgDeliveryRate: number;
  sampleSize: number;
}

export interface AnalyticsAgentOutput {
  summary: string;
  insights: string[];
  recommendations: string[];
  performanceVsBenchmark: "above" | "below" | "at" | "insufficient_data";
}

// ── Orchestrator step (SSE / DB stored) ──────────────────────────────────────

export interface OrchestratorStep {
  type: "thinking" | "checkpoint" | "tool_call" | "tool_result" | "error";
  message?: string;
  checkpoint?: string;
  tool?: string;
  data?: unknown;
  timestamp: string; // ISO date string
}

// ── Analytics snapshot ────────────────────────────────────────────────────────

export interface AnalyticsSnapshot {
  campaignId: string;
  status: string;
  totalSent: number;
  delivered: number;
  failed: number;
  bounced: number;
  opened: number;
  clicked: number;
  converted: number;
  deliveryRate: number;
  openRate: number;
  ctr: number;
  conversionRate: number;
}
