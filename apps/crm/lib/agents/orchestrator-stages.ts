/**
 * HITL Orchestrator Stage Runners
 *
 * This file implements the multi-step human-in-the-loop (HITL) approval flow.
 * Instead of one monolithic orchestrator function, there are 4 stages that run
 * sequentially, pausing at each step for marketer review.
 *
 * Flow:
 *   Stage 1: memory + segment agent → pause at AWAITING_SEGMENT_APPROVAL
 *   Stage 2: product agent          → pause at AWAITING_PRODUCT_APPROVAL
 *   Stage 3: content agent          → pause at AWAITING_CONTENT_APPROVAL
 *   Stage 4: channel agent          → pause at AWAITING_LAUNCH_APPROVAL
 *   Launch:  create campaign + enqueue BullMQ jobs
 *
 * See HUMAN_IN_THE_LOOP.md for full architecture documentation.
 */

import { db } from "@/lib/db/client";
import { runSegmentAgent } from "./segment-agent";
import { runProductAgent } from "./product-agent";
import { runContentAgent } from "./content-agent";
import { runChannelAgent } from "./channel-agent";
import { getCampaignMemory } from "@/lib/memory/campaign";
import { getBrandMemory } from "@/lib/memory/brand";
import { emitStep } from "./orchestrator-events";
import { getCampaignQueue } from "@/lib/queue/client";
import { logger } from "@/lib/utils/logger";
import { createId } from "@paralleldrive/cuid2";
import type {
  SegmentAgentOutput,
  ProductAgentOutput,
  ContentAgentOutput,
  ExecutionPlan,
} from "@/types";
import type { CampaignSendJob } from "@xeno/shared-types";
import { config } from "@/lib/utils/config";

// ── STAGE 1 ───────────────────────────────────────────────────────────────────
// Runs: campaign memory retrieval + segment agent
// Pauses at: AWAITING_SEGMENT_APPROVAL

export async function runStage1_Segment(
  runId: string,
  overrideDescription?: string
): Promise<void> {
  const run = await db.orchestratorRun.findUniqueOrThrow({ where: { id: runId } });

  await emitStep(runId, { type: "thinking", message: "[1/4] Reviewing past Nike campaign learnings..." });

  // Fetch memory context in parallel — brand is always needed, campaigns are goal-specific
  const [brandMemory, campaignMemories] = await Promise.all([
    getBrandMemory(),
    getCampaignMemory(run.goal),
  ]);

  if (campaignMemories.length > 0) {
    await emitStep(runId, {
      type: "thinking",
      message: `Found ${campaignMemories.length} similar past campaigns to learn from`,
    });
  }

  await emitStep(runId, { type: "thinking", message: "[2/4] Analyzing audience segment..." });

  // Use override description if marketer edited the segment, otherwise use the original goal
  const segmentDescription = overrideDescription ?? run.goal;

  let segmentResult: SegmentAgentOutput;
  try {
    segmentResult = await runSegmentAgent(segmentDescription);
  } catch (err) {
    await db.orchestratorRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        error: `Segment agent failed: ${(err as Error).message}`,
      },
    });
    logger.error({ runId, err }, "Stage 1 segment agent failed");
    return;
  }

  const count = segmentResult.count;
  await emitStep(runId, {
    type: "checkpoint",
    checkpoint: "SEGMENT",
    message: count === 0
      ? `WARNING: No customers found for this audience. Consider broadening the criteria.`
      : `DONE: Found ${count.toLocaleString()} matching customers`,
    data: segmentResult,
  });

  // Persist results and flip status to awaiting approval
  await db.orchestratorRun.update({
    where: { id: runId },
    data: {
      status: "AWAITING_SEGMENT_APPROVAL",
      currentCheckpoint: "SEGMENT",
      segmentResult: segmentResult as object,
      // NOTE: do NOT push to steps here — emitStep() already added the checkpoint step above.
      // Double-writing causes duplicate entries in the ThinkingPanel.
    },
  });
}

// ── STAGE 2 ───────────────────────────────────────────────────────────────────
// Runs: product agent
// Pauses at: AWAITING_PRODUCT_APPROVAL
// Input: approved (possibly edited) segment from checkpoint 1

export async function runStage2_Products(runId: string): Promise<void> {
  const run = await db.orchestratorRun.findUniqueOrThrow({ where: { id: runId } });

  // Use edited segment if marketer changed it, otherwise use original agent output
  const segmentResult = (run.segmentEdits ?? run.segmentResult) as unknown as SegmentAgentOutput;

  await emitStep(runId, { type: "thinking", message: "[1/2] Selecting relevant Nike products..." });

  const productResult = await runProductAgent(
    run.goal, // category is now LLM-inferred from the full goal inside the agent
    run.goal
  );

  await emitStep(runId, {
    type: "checkpoint",
    checkpoint: "PRODUCT",
    message: `DONE: Found ${productResult.primaryProducts.length} primary products + ${productResult.crossSellSuggestions.length} cross-sell suggestions`,
    data: productResult,
  });

  await db.orchestratorRun.update({
    where: { id: runId },
    data: {
      status: "AWAITING_PRODUCT_APPROVAL",
      currentCheckpoint: "PRODUCT",
      productResult: productResult as object,
    },
  });
}

// ── STAGE 3 ───────────────────────────────────────────────────────────────────
// Runs: content agent
// Pauses at: AWAITING_CONTENT_APPROVAL
// Input: approved products (possibly edited by marketer)

export async function runStage3_Content(
  runId: string,
  regenerationFeedback?: string
): Promise<void> {
  const run = await db.orchestratorRun.findUniqueOrThrow({ where: { id: runId } });

  const segmentResult = (run.segmentEdits ?? run.segmentResult) as unknown as SegmentAgentOutput;
  const productResult = (run.productEdits ?? run.productResult) as unknown as ProductAgentOutput;
  const brandMemory = await getBrandMemory();

  // Preliminary channel guess for message format
  // We'll do a proper recommendation in stage 4
  const channel = (brandMemory.preferredChannels[0] ?? "email") as "whatsapp" | "email" | "sms" | "rcs";

  await emitStep(runId, { type: "thinking", message: "[1/2] Writing your Nike campaign message..." });

  const contentResult = await runContentAgent({
    channel,
    audienceDescription: segmentResult.description ?? run.goal,
    products: productResult.primaryProducts.map((p) => p.name),
    tone: brandMemory.brandTone,
    additionalInstruction: regenerationFeedback,
  });

  await emitStep(runId, {
    type: "checkpoint",
    checkpoint: "CONTENT",
    message: "DONE: Campaign message ready for your review",
    data: { contentResult, channel },
  });

  await db.orchestratorRun.update({
    where: { id: runId },
    data: {
      status: "AWAITING_CONTENT_APPROVAL",
      currentCheckpoint: "CONTENT",
      contentResult: { ...contentResult, channelHint: channel } as object,
    },
  });
}

// ── STAGE 4 ───────────────────────────────────────────────────────────────────
// Runs: channel agent
// Pauses at: AWAITING_LAUNCH_APPROVAL (final review before launch)

export async function runStage4_Channel(runId: string): Promise<void> {
  const run = await db.orchestratorRun.findUniqueOrThrow({ where: { id: runId } });

  const segmentResult = (run.segmentEdits ?? run.segmentResult) as unknown as SegmentAgentOutput;

  await emitStep(runId, { type: "thinking", message: "[1/2] Choosing best channel based on past performance..." });

  const channelResult = await runChannelAgent(segmentResult.description ?? run.goal);

  // Build the final execution plan — everything the campaign needs to launch
  const productResult = (run.productEdits ?? run.productResult) as unknown as ProductAgentOutput;
  const contentResult = (run.contentEdits ?? run.contentResult) as unknown as ContentAgentOutput & { channelHint?: string };

  const executionPlan: ExecutionPlan = {
    segmentSQL: segmentResult.sql,
    segmentDescription: segmentResult.description ?? run.goal,
    audienceCount: segmentResult.count,
    sampleCustomers: segmentResult.sample,
    products: productResult.primaryProducts,
    messageDraft: contentResult.body,
    subject: contentResult.subject,
    cta: contentResult.cta,
    recommendedChannel: channelResult.recommendedChannel,
    channelConfidence: channelResult.confidenceScore,
    estimatedReach: segmentResult.count,
  };

  await emitStep(runId, {
    type: "checkpoint",
    checkpoint: "LAUNCH",
    message: `DONE: Campaign ready! Recommended channel: ${channelResult.recommendedChannel.toUpperCase()} (${Math.round(channelResult.confidenceScore * 100)}% confidence)`,
    data: { channelResult, executionPlan },
  });

  await db.orchestratorRun.update({
    where: { id: runId },
    data: {
      status: "AWAITING_LAUNCH_APPROVAL",
      currentCheckpoint: "LAUNCH",
      channelResult: channelResult as object,
      executionPlan: executionPlan as object,
    },
  });
}

// ── LAUNCH ────────────────────────────────────────────────────────────────────
// Creates the Campaign record and enqueues all BullMQ send jobs

export async function launchCampaign(runId: string, scheduledAt?: Date): Promise<void> {
  const run = await db.orchestratorRun.findUniqueOrThrow({ where: { id: runId } });
  const plan = run.executionPlan as unknown as ExecutionPlan;

  // Apply channel override if marketer changed the channel at the final review step
  const channel = (run.channelOverride ?? plan.recommendedChannel) as "whatsapp" | "email" | "sms" | "rcs";

  // Resolve audience — strip trailing semicolons from stored SQL (LLM may have added one)
  const launchSQL = (plan.segmentSQL as string).replace(/;\s*$/, "");
  const customers = await db.$queryRawUnsafe<{ id: string }[]>(`${launchSQL}`);

  // Create the Campaign record
  const campaign = await db.campaign.create({
    data: {
      id: createId(),
      name: `Campaign from "${run.goal.slice(0, 60)}"`,
      goal: run.goal,
      status: "RUNNING",
      channel,
      messageTemplate: plan.messageDraft,
      subject: plan.subject,
      segmentSQL: plan.segmentSQL,
      audienceCount: customers.length,
      scheduledAt: scheduledAt ?? new Date(),
    },
  });

  // Link run to campaign and mark run as COMPLETED
  await db.orchestratorRun.update({
    where: { id: runId },
    data: { status: "COMPLETED", campaignId: campaign.id },
  });

  // Enqueue one BullMQ job per customer — use addBulk (single Redis round trip)
  const webhookUrl = `${config.WEBHOOK_BASE_URL}/api/webhook/receipt`;
  const jobs = customers.map((customer) => ({
    name: "send",
    data: {
      campaignId: campaign.id,
      customerId: customer.id,
      channel,
      message: plan.messageDraft,
      subject: plan.subject,
      idempotencyKey: `${campaign.id}:${customer.id}`,
    } satisfies CampaignSendJob,
    opts: {
      attempts: 3,
      backoff: { type: "exponential" as const, delay: 2000 },
    },
  }));

  const queue = getCampaignQueue();
  await queue.addBulk(jobs as Parameters<typeof queue.addBulk>[0]);

  logger.info({ runId, campaignId: campaign.id, audienceSize: customers.length, channel }, "Campaign launched");
}

// ── Error handler ─────────────────────────────────────────────────────────────

export async function handleStageError(
  runId: string,
  err: unknown,
  stage: string
): Promise<void> {
  logger.error({ runId, stage, err }, "Orchestrator stage failed");
  await db.orchestratorRun.update({
    where: { id: runId },
    data: {
      status: "FAILED",
      error: `${stage} failed: ${(err as Error).message}`,
    },
  });
}

