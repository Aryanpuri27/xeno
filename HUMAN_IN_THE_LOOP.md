# Human-in-the-Loop (HITL) Orchestrator — Deep Dive

> This document explains the multi-step human approval flow woven into the
> orchestrator pipeline. Instead of a single "review everything at the end" gate,
> the marketer is invited to approve, edit, or reject the AI's output at each
> meaningful checkpoint — audience, products, message, channel — before the
> orchestrator proceeds to the next step.
>
> Read AI_ORCHESTRATOR_AND_MEMORY.md first if you haven't already.

---

## Table of Contents

1. [Why Multi-Step HITL Beats a Single Review Gate](#1-why-multi-step-hitl)
2. [The Four Checkpoints](#2-the-four-checkpoints)
3. [Architecture: Pauseable Orchestrator Runs](#3-architecture-pauseable-orchestrator-runs)
4. [Database Schema for Pauseable Runs](#4-database-schema)
5. [Orchestrator State Machine](#5-orchestrator-state-machine)
6. [Backend: Pausing and Resuming Runs](#6-backend-pausing-and-resuming-runs)
7. [Checkpoint 1 — Audience Approval](#7-checkpoint-1-audience-approval)
8. [Checkpoint 2 — Product Approval](#8-checkpoint-2-product-approval)
9. [Checkpoint 3 — Message Approval](#9-checkpoint-3-message-approval)
10. [Checkpoint 4 — Channel + Final Launch](#10-checkpoint-4-channel--final-launch)
11. [Frontend: The Step-by-Step Review UI](#11-frontend-the-step-by-step-review-ui)
12. [SSE: Streaming Pauses to the Browser](#12-sse-streaming-pauses-to-the-browser)
13. [Edit Flows — What the Marketer Can Change](#13-edit-flows)
14. [Complexity Analysis](#14-complexity-analysis)
15. [Full Code Reference](#15-full-code-reference)

---

## 1. Why Multi-Step HITL Beats a Single Review Gate

### The problem with a single end-of-pipeline review

In the original design, the orchestrator runs all five agents and presents a complete
plan for approval. This creates a bad experience and a bad system:

```
AI runs everything → Marketer sees: segment + products + message + channel
                   → Marketer says: "the message is fine but the audience is wrong"
                   → Now what? Re-run everything? Only the segment?
```

The marketer has no ability to course-correct the AI mid-flight. If the segment is
wrong, the products built on top of it are also wrong, the message is wrong, and the
entire run is wasted. You find out at the end.

### The solution: pause-and-resume at meaningful checkpoints

```
Segment Agent runs → PAUSE → Marketer approves/edits audience
                   ↓ (approved)
Product Agent runs → PAUSE → Marketer approves/edits products
                   ↓ (approved)
Content Agent runs → PAUSE → Marketer approves/edits message
                   ↓ (approved)
Channel Agent runs → PAUSE → Marketer sees channel + full summary → Approves launch
                   ↓ (approved)
Campaign Agent enqueues jobs → Messages go out
```

Now if the audience is wrong, you fix it at step 1. The AI only redoes the work that
depends on what changed. Product and message are unaffected by a segment edit unless
the segment change implies a different product category.

### What this adds to your evaluation score

The assignment explicitly scores on:
- **Creativity in scoping** — this is a bold product choice most candidates won't make
- **AI-native architecture** — this is what real AI-native products look like (Cursor, Linear AI, Notion AI all do this)
- **System design** — resumable async state machines are a real engineering challenge
- **Thought clarity** — the video demo becomes dramatically more compelling

---

## 2. The Four Checkpoints

```
┌─────────────────────────────────────────────────────────────────┐
│   CHECKPOINT 1                                                  │
│   After Segment Agent                                           │
│                                                                 │
│   AI shows:  "Found 421 customers — dormant coffee buyers,      │
│               last purchase 60-90 days ago."                    │
│   Marketer:  [Looks Good ✓] [Edit Criteria ✏️] [Too Broad ↩]   │
└─────────────────────────────────────────────────────────────────┘
                         ↓ approved
┌─────────────────────────────────────────────────────────────────┐
│   CHECKPOINT 2                                                  │
│   After Product Agent                                           │
│                                                                 │
│   AI shows:  "Suggesting Cold Brew 500ml, Espresso Beans 250g"  │
│   Marketer:  [Looks Good ✓] [Remove a product ✏️] [Add one +]  │
└─────────────────────────────────────────────────────────────────┘
                         ↓ approved
┌─────────────────────────────────────────────────────────────────┐
│   CHECKPOINT 3                                                  │
│   After Content Agent                                           │
│                                                                 │
│   AI shows:  Full message preview (WhatsApp / Email layout)     │
│   Marketer:  [Looks Good ✓] [Edit Message ✏️] [Regenerate 🔄]  │
└─────────────────────────────────────────────────────────────────┘
                         ↓ approved
┌─────────────────────────────────────────────────────────────────┐
│   CHECKPOINT 4                                                  │
│   After Channel Agent — Final review before launch              │
│                                                                 │
│   AI shows:  Full campaign summary + channel recommendation     │
│   Marketer:  [Launch Campaign 🚀] [Change Channel ↩]           │
└─────────────────────────────────────────────────────────────────┘
                         ↓ approved
                    Campaign enqueued
```

---

## 3. Architecture: Pauseable Orchestrator Runs

### The core insight

The orchestrator cannot be a single synchronous function call anymore.
It needs to:
1. Run some agents
2. **Stop** and persist its state to the database
3. Wait for the marketer's response (could be 30 seconds, could be 2 hours)
4. **Resume** from exactly where it paused, incorporating the marketer's edits

This means the orchestrator loop must be split into **stages**, each stage being a
separate API call that reads state from the DB, does work, writes a checkpoint, and
returns a response to the browser.

### High-level data flow

```
Browser                  CRM API                   Database
  │                         │                          │
  │  POST /orchestrator/start│                          │
  │  { goal }               │                          │
  │ ──────────────────────► │                          │
  │                         │  INSERT OrchestratorRun  │
  │                         │  status: "running"       │
  │                         │ ───────────────────────► │
  │                         │                          │
  │                         │  [run_segment_agent]     │
  │                         │  [run_product_agent]     │
  │                         │                          │
  │                         │  UPDATE OrchestratorRun  │
  │                         │  status: "awaiting_segment_approval"
  │                         │  checkpointData: { segment, products }
  │                         │ ───────────────────────► │
  │  ◄────────────────────  │                          │
  │  { runId, status }      │                          │
  │                         │                          │
  │  [SSE stream shows      │                          │
  │   checkpoint UI]        │                          │
  │                         │                          │
  │  POST /orchestrator/:id/approve
  │  { checkpoint: "segment", action: "approve" }
  │ ──────────────────────► │                          │
  │                         │  [run_content_agent]     │
  │                         │  [run_channel_agent]     │
  │                         │                          │
  │                         │  UPDATE OrchestratorRun  │
  │                         │  status: "awaiting_product_approval"
  │                         │ ───────────────────────► │
  │  ◄────────────────────  │                          │
  │  { nextCheckpoint }     │                          │
```

---

## 4. Database Schema

### The OrchestratorRun table — extended for HITL

```prisma
// prisma/schema.prisma

model OrchestratorRun {
  id     String @id @default(cuid())

  // The marketer's original goal — never changes
  goal   String

  // Current state in the state machine
  // See Section 5 for all possible values
  status OrchestratorRunStatus @default(RUNNING)

  // Which checkpoint we are currently paused at
  // null when running between checkpoints
  currentCheckpoint CheckpointType?

  // ─── Accumulated results from each agent ─────────────────────────
  // Populated as each agent completes.
  // Edits from the marketer are merged back here before the next stage.

  segmentResult    Json?   // SegmentAgentOutput — set after checkpoint 1
  productResult    Json?   // ProductAgentOutput — set after checkpoint 2
  contentResult    Json?   // ContentAgentOutput — set after checkpoint 3
  channelResult    Json?   // ChannelAgentOutput — set after checkpoint 4

  // ─── Marketer edits at each checkpoint ───────────────────────────
  segmentEdits     Json?   // What the marketer changed about the segment
  productEdits     Json?   // Products added/removed by the marketer
  contentEdits     Json?   // Message text the marketer rewrote
  channelOverride  String? // If marketer overrode channel recommendation

  // ─── Final execution plan (set when all checkpoints pass) ─────────
  executionPlan    Json?   // ExecutionPlan — ready to enqueue

  // ─── Step log for the SSE thinking panel ─────────────────────────
  steps            Json    @default("[]")  // OrchestratorStep[]

  // ─── Linked campaign (created after final approval) ───────────────
  campaignId       String? @unique
  campaign         Campaign? @relation(fields: [campaignId], references: [id])

  error            String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}

enum OrchestratorRunStatus {
  RUNNING                      // actively executing agents
  AWAITING_SEGMENT_APPROVAL    // paused at checkpoint 1
  AWAITING_PRODUCT_APPROVAL    // paused at checkpoint 2
  AWAITING_CONTENT_APPROVAL    // paused at checkpoint 3
  AWAITING_LAUNCH_APPROVAL     // paused at checkpoint 4 (final)
  COMPLETED                    // campaign launched
  FAILED                       // unrecoverable error
  CANCELLED                    // marketer cancelled
}

enum CheckpointType {
  SEGMENT
  PRODUCT
  CONTENT
  LAUNCH
}
```

---

## 5. Orchestrator State Machine

```
                      ┌─────────────────┐
                      │     RUNNING     │ ← Initial state after POST /start
                      │ (segment agent  │
                      │  + memory)      │
                      └────────┬────────┘
                               │ segment agent completes
                               ▼
                 ┌─────────────────────────────┐
                 │  AWAITING_SEGMENT_APPROVAL  │ ← Paused. Marketer sees audience.
                 └──────────────┬──────────────┘
                                │
              ┌─────────────────┼─────────────────────┐
              │ approve         │ edit + rerun         │ cancel
              ▼                 ▼                      ▼
         RUNNING           RUNNING               CANCELLED
    (product agent)   (segment agent reruns
                       with new description)
                               │
                               │ product agent completes
                               ▼
                 ┌─────────────────────────────┐
                 │  AWAITING_PRODUCT_APPROVAL  │ ← Paused. Marketer sees products.
                 └──────────────┬──────────────┘
                                │
              ┌─────────────────┼─────────────────────┐
              │ approve         │ edit products        │ cancel
              ▼                 ▼                      ▼
         RUNNING          (skip re-running         CANCELLED
    (content agent)        product agent —
                           use marketer's
                           edited list)
                               │
                               │ content agent completes
                               ▼
                 ┌─────────────────────────────┐
                 │  AWAITING_CONTENT_APPROVAL  │ ← Paused. Marketer sees message.
                 └──────────────┬──────────────┘
                                │
              ┌─────────────────┼─────────────────────┐
              │ approve         │ edit / regenerate    │ cancel
              ▼                 ▼                      ▼
         RUNNING          (content agent             CANCELLED
    (channel agent)        reruns OR marketer's
                           text is used directly)
                               │
                               │ channel agent completes
                               ▼
                 ┌─────────────────────────────┐
                 │   AWAITING_LAUNCH_APPROVAL  │ ← Final review. Full summary.
                 └──────────────┬──────────────┘
                                │
                     ┌──────────┴──────────┐
                     │ launch              │ cancel
                     ▼                     ▼
               COMPLETED              CANCELLED
          (jobs enqueued)
```

### Key state machine rules

1. **Forward only** — once a checkpoint is approved, you never go back to it unless the
   marketer explicitly clicks "Edit" on a previous step from the summary panel.
2. **Edit does not always re-run the agent** — if the marketer edits the product list
   directly (adds/removes products), we use their list and skip re-running the product
   agent. Only if they say "suggest different products" do we re-run.
3. **Content regeneration** — if the marketer clicks "Regenerate", we re-run the content
   agent with their feedback as an additional instruction. If they edit text directly,
   we store their version verbatim.
4. **Channel override** — the marketer can always override the channel recommendation.
   We store the override and use it for the final launch without re-running the channel agent.

---

## 6. Backend: Pausing and Resuming Runs

### Stage runner — the core abstraction

Each stage is a function that:
- Reads the current run from the DB
- Runs one or more agents
- Writes results + new status to DB
- Returns (does not wait for approval)

```typescript
// lib/agents/orchestrator-stages.ts

import { db } from "@/lib/db/client";
import { runSegmentAgent } from "./segment-agent";
import { runProductAgent } from "./product-agent";
import { runContentAgent } from "./content-agent";
import { runChannelAgent } from "./channel-agent";
import { getCampaignMemory } from "@/lib/memory/campaign";
import { getBrandMemory } from "@/lib/memory/brand";
import { emitStep } from "./orchestrator-events";
import type {
  OrchestratorRun,
  SegmentAgentOutput,
  ProductAgentOutput,
  ContentAgentOutput,
  ChannelAgentOutput,
} from "@/types";

// ─── STAGE 1 ─────────────────────────────────────────────────────────────────
// Runs: campaign memory retrieval + segment agent
// Pauses at: AWAITING_SEGMENT_APPROVAL

export async function runStage1_Segment(runId: string): Promise<void> {
  const run = await db.orchestratorRun.findUniqueOrThrow({ where: { id: runId } });

  await emitStep(runId, { type: "thinking", message: "📚 Reviewing past campaign learnings..." });

  // Fetch memory context
  const [brandMemory, campaignMemories] = await Promise.all([
    getBrandMemory(),
    getCampaignMemory(run.goal),
  ]);

  await emitStep(runId, { type: "thinking", message: "🎯 Finding your target audience..." });

  // Run segment agent — may throw if SQL is invalid
  let segmentResult: SegmentAgentOutput;
  try {
    segmentResult = await runSegmentAgent(run.goal, campaignMemories);
  } catch (err) {
    await db.orchestratorRun.update({
      where: { id: runId },
      data: { status: "FAILED", error: `Segment agent failed: ${(err as Error).message}` },
    });
    return;
  }

  // Pause — write results and flip status to awaiting approval
  await db.orchestratorRun.update({
    where: { id: runId },
    data: {
      status: "AWAITING_SEGMENT_APPROVAL",
      currentCheckpoint: "SEGMENT",
      segmentResult: segmentResult as object,
      // Store memory context so stage 2 can use it without re-fetching
      steps: {
        push: {
          type: "checkpoint",
          checkpoint: "SEGMENT",
          data: segmentResult,
          timestamp: new Date(),
        },
      },
    },
  });
}

// ─── STAGE 2 ─────────────────────────────────────────────────────────────────
// Runs: product agent
// Pauses at: AWAITING_PRODUCT_APPROVAL
// Input: approved (possibly edited) segment from checkpoint 1

export async function runStage2_Products(runId: string): Promise<void> {
  const run = await db.orchestratorRun.findUniqueOrThrow({ where: { id: runId } });

  // Use edited segment if the marketer changed it, otherwise use agent output
  const segmentResult = (run.segmentEdits ?? run.segmentResult) as SegmentAgentOutput;

  await emitStep(runId, { type: "thinking", message: "🛍️ Selecting relevant products..." });

  const productResult = await runProductAgent(
    segmentResult.inferredCategory, // extracted from segment description
    run.goal
  );

  await db.orchestratorRun.update({
    where: { id: runId },
    data: {
      status: "AWAITING_PRODUCT_APPROVAL",
      currentCheckpoint: "PRODUCT",
      productResult: productResult as object,
    },
  });
}

// ─── STAGE 3 ─────────────────────────────────────────────────────────────────
// Runs: content agent
// Pauses at: AWAITING_CONTENT_APPROVAL
// Input: approved products (possibly edited by marketer)

export async function runStage3_Content(
  runId: string,
  regenerationFeedback?: string  // if marketer clicked "Regenerate with feedback"
): Promise<void> {
  const run = await db.orchestratorRun.findUniqueOrThrow({ where: { id: runId } });

  // Use edited products if marketer changed them
  const productResult = (run.productEdits ?? run.productResult) as ProductAgentOutput;

  // Preliminary channel guess — we need a channel to write the right format
  // We'll do a proper channel recommendation in stage 4
  // For now, use brand preference or default to whatsapp
  const brandMemory = await getBrandMemory();
  const channel = brandMemory.preferredChannels[0] ?? "whatsapp";

  await emitStep(runId, { type: "thinking", message: "✍️ Writing your campaign message..." });

  const contentResult = await runContentAgent({
    channel,
    audienceDescription: (run.segmentEdits ?? run.segmentResult as SegmentAgentOutput).description,
    products: productResult.primaryProducts.map((p) => p.name),
    tone: brandMemory.brandTone,
    // If marketer provided regeneration feedback, include it
    additionalInstruction: regenerationFeedback,
  });

  await db.orchestratorRun.update({
    where: { id: runId },
    data: {
      status: "AWAITING_CONTENT_APPROVAL",
      currentCheckpoint: "CONTENT",
      contentResult: contentResult as object,
    },
  });
}

// ─── STAGE 4 ─────────────────────────────────────────────────────────────────
// Runs: channel agent
// Pauses at: AWAITING_LAUNCH_APPROVAL (final review)

export async function runStage4_Channel(runId: string): Promise<void> {
  const run = await db.orchestratorRun.findUniqueOrThrow({ where: { id: runId } });

  const segmentResult = (run.segmentEdits ?? run.segmentResult) as SegmentAgentOutput;

  await emitStep(runId, { type: "thinking", message: "📡 Choosing the best channel..." });

  const channelResult = await runChannelAgent(segmentResult.description);

  // Build the final execution plan — everything the campaign needs to launch
  const executionPlan = buildExecutionPlan(run, channelResult);

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
```

### The approval endpoint — routes to the right next stage

```typescript
// app/api/orchestrator/[runId]/approve/route.ts

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { handleApiError } from "@/lib/utils/errors";
import {
  runStage2_Products,
  runStage3_Content,
  runStage4_Channel,
  launchCampaign,
} from "@/lib/agents/orchestrator-stages";

const ApproveSchema = z.discriminatedUnion("checkpoint", [
  z.object({
    checkpoint: z.literal("SEGMENT"),
    action: z.enum(["approve", "edit", "cancel"]),
    // If action is "edit", provide the new segment description
    editedDescription: z.string().optional(),
    // If action is "edit", optionally provide override SQL (advanced)
    editedSQL: z.string().optional(),
  }),
  z.object({
    checkpoint: z.literal("PRODUCT"),
    action: z.enum(["approve", "edit", "cancel"]),
    // If action is "edit", provide the modified product list
    editedProducts: z.array(z.object({
      id: z.string(),
      name: z.string(),
      action: z.enum(["keep", "remove", "add"]),
    })).optional(),
  }),
  z.object({
    checkpoint: z.literal("CONTENT"),
    action: z.enum(["approve", "edit", "regenerate", "cancel"]),
    // If action is "edit", provide the full edited message
    editedMessage: z.string().optional(),
    editedSubject: z.string().optional(),
    // If action is "regenerate", provide feedback for the AI
    regenerationFeedback: z.string().optional(),
  }),
  z.object({
    checkpoint: z.literal("LAUNCH"),
    action: z.enum(["launch", "cancel"]),
    // Marketer can override the channel recommendation at the final step
    channelOverride: z.enum(["whatsapp", "email", "sms", "rcs"]).optional(),
    // Optional scheduled send time
    scheduledAt: z.coerce.date().optional(),
  }),
]);

export async function POST(
  request: NextRequest,
  { params }: { params: { runId: string } }
) {
  try {
    const body = await request.json();
    const input = ApproveSchema.parse(body);
    const { runId } = params;

    const run = await db.orchestratorRun.findUniqueOrThrow({ where: { id: runId } });

    // ── Handle cancel at any step ────────────────────────────────────
    if (input.action === "cancel") {
      await db.orchestratorRun.update({
        where: { id: runId },
        data: { status: "CANCELLED" },
      });
      return NextResponse.json({ status: "cancelled" });
    }

    // ── Checkpoint 1: Segment ────────────────────────────────────────
    if (input.checkpoint === "SEGMENT") {
      if (input.action === "approve") {
        // Proceed to stage 2 immediately (async — don't await)
        runStage2_Products(runId).catch((err) =>
          handleStageError(runId, err, "stage2_products")
        );
        return NextResponse.json({ status: "proceeding", nextCheckpoint: "PRODUCT" });
      }

      if (input.action === "edit" && input.editedDescription) {
        // Store the edit and re-run stage 1 with new description
        await db.orchestratorRun.update({
          where: { id: runId },
          data: {
            status: "RUNNING",
            segmentEdits: {
              editedDescription: input.editedDescription,
              editedSQL: input.editedSQL,
            } as object,
          },
        });

        // Re-run segment agent with the new description
        runStage1_Segment_WithOverride(runId, input.editedDescription).catch((err) =>
          handleStageError(runId, err, "stage1_segment_retry")
        );
        return NextResponse.json({ status: "rerunning", checkpoint: "SEGMENT" });
      }
    }

    // ── Checkpoint 2: Products ───────────────────────────────────────
    if (input.checkpoint === "PRODUCT") {
      if (input.action === "approve") {
        runStage3_Content(runId).catch((err) =>
          handleStageError(runId, err, "stage3_content")
        );
        return NextResponse.json({ status: "proceeding", nextCheckpoint: "CONTENT" });
      }

      if (input.action === "edit" && input.editedProducts) {
        // Marketer edited the product list directly — no agent re-run needed
        // Merge edits: keep "keep" items, remove "remove" items, add "add" items
        const currentProducts = run.productResult as ProductAgentOutput;
        const editedProductResult = applyProductEdits(currentProducts, input.editedProducts);

        await db.orchestratorRun.update({
          where: { id: runId },
          data: { productEdits: editedProductResult as object },
        });

        // Proceed to content with the edited product list
        runStage3_Content(runId).catch((err) =>
          handleStageError(runId, err, "stage3_content_after_edit")
        );
        return NextResponse.json({ status: "proceeding", nextCheckpoint: "CONTENT" });
      }
    }

    // ── Checkpoint 3: Content ────────────────────────────────────────
    if (input.checkpoint === "CONTENT") {
      if (input.action === "approve") {
        runStage4_Channel(runId).catch((err) =>
          handleStageError(runId, err, "stage4_channel")
        );
        return NextResponse.json({ status: "proceeding", nextCheckpoint: "LAUNCH" });
      }

      if (input.action === "edit" && (input.editedMessage || input.editedSubject)) {
        // Marketer edited the message directly — store verbatim, no agent re-run
        const currentContent = run.contentResult as ContentAgentOutput;
        await db.orchestratorRun.update({
          where: { id: runId },
          data: {
            contentEdits: {
              ...currentContent,
              body: input.editedMessage ?? currentContent.body,
              subject: input.editedSubject ?? currentContent.subject,
            } as object,
          },
        });

        runStage4_Channel(runId).catch((err) =>
          handleStageError(runId, err, "stage4_channel_after_edit")
        );
        return NextResponse.json({ status: "proceeding", nextCheckpoint: "LAUNCH" });
      }

      if (input.action === "regenerate") {
        // Marketer wants a new message — re-run content agent with feedback
        await db.orchestratorRun.update({
          where: { id: runId },
          data: { status: "RUNNING" },
        });

        runStage3_Content(runId, input.regenerationFeedback).catch((err) =>
          handleStageError(runId, err, "stage3_content_regenerate")
        );
        return NextResponse.json({ status: "regenerating", checkpoint: "CONTENT" });
      }
    }

    // ── Checkpoint 4: Launch ─────────────────────────────────────────
    if (input.checkpoint === "LAUNCH") {
      if (input.action === "launch") {
        // If marketer overrode the channel, apply it to the execution plan
        if (input.channelOverride) {
          const currentPlan = run.executionPlan as ExecutionPlan;
          await db.orchestratorRun.update({
            where: { id: runId },
            data: {
              channelOverride: input.channelOverride,
              executionPlan: {
                ...currentPlan,
                recommendedChannel: input.channelOverride,
              } as object,
            },
          });
        }

        // Launch! Create the campaign and enqueue all jobs
        await launchCampaign(runId, input.scheduledAt);
        return NextResponse.json({ status: "launched" });
      }
    }

    return NextResponse.json({ error: { code: "INVALID_ACTION", message: "Unhandled action" } }, { status: 400 });
  } catch (error) {
    return handleApiError(error);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function handleStageError(runId: string, err: unknown, stage: string): Promise<void> {
  logger.error({ runId, stage, err }, "Orchestrator stage failed");
  await db.orchestratorRun.update({
    where: { id: runId },
    data: {
      status: "FAILED",
      error: `${stage} failed: ${(err as Error).message}`,
    },
  });
}

function applyProductEdits(
  current: ProductAgentOutput,
  edits: Array<{ id: string; name: string; action: "keep" | "remove" | "add" }>
): ProductAgentOutput {
  const toRemove = new Set(edits.filter((e) => e.action === "remove").map((e) => e.id));
  const toAdd = edits.filter((e) => e.action === "add").map((e) => ({
    id: e.id,
    name: e.name,
    category: "manual",
    price: 0,
    description: "",
  }));

  return {
    ...current,
    primaryProducts: [
      ...current.primaryProducts.filter((p) => !toRemove.has(p.id)),
      ...toAdd,
    ],
  };
}

function buildExecutionPlan(run: OrchestratorRun, channelResult: ChannelAgentOutput): ExecutionPlan {
  const segment = (run.segmentEdits ?? run.segmentResult) as SegmentAgentOutput;
  const products = (run.productEdits ?? run.productResult) as ProductAgentOutput;
  const content = (run.contentEdits ?? run.contentResult) as ContentAgentOutput;

  return {
    segmentSQL: segment.sql,
    segmentDescription: segment.description,
    audienceCount: segment.count,
    sampleCustomers: segment.sample,
    products: products.primaryProducts,
    messageDraft: content.body,
    subject: content.subject,
    cta: content.cta,
    recommendedChannel: channelResult.recommendedChannel,
    channelConfidence: channelResult.confidenceScore,
    channelReasoning: channelResult.reasoning,
    estimatedReach: segment.count,
  };
}
```

### The launch function

```typescript
// lib/agents/orchestrator-stages.ts (continued)

export async function launchCampaign(runId: string, scheduledAt?: Date): Promise<void> {
  const run = await db.orchestratorRun.findUniqueOrThrow({ where: { id: runId } });
  const plan = run.executionPlan as ExecutionPlan;

  // 1. Resolve the audience — run the validated SQL to get all customer IDs
  const customers = await db.$queryRawUnsafe<{ id: string }[]>(
    `${plan.segmentSQL}`
  );

  // 2. Create the Campaign record
  const campaign = await db.campaign.create({
    data: {
      name: `Campaign from "${run.goal.slice(0, 60)}"`,
      goal: run.goal,
      status: "running",
      channel: plan.recommendedChannel,
      messageTemplate: plan.messageDraft,
      subject: plan.subject,
      segmentSQL: plan.segmentSQL,
      audienceCount: customers.length,
      scheduledAt: scheduledAt ?? new Date(),
    },
  });

  // 3. Link run to campaign
  await db.orchestratorRun.update({
    where: { id: runId },
    data: { status: "COMPLETED", campaignId: campaign.id },
  });

  // 4. Enqueue one BullMQ job per customer — use addBulk for efficiency
  const jobs = customers.map((customer) => ({
    name: "send",
    data: {
      campaignId: campaign.id,
      customerId: customer.id,
      channel: plan.recommendedChannel,
      message: plan.messageDraft,
      idempotencyKey: `${campaign.id}:${customer.id}`,
    } satisfies CampaignSendJob,
  }));

  await campaignQueue.addBulk(jobs);
}
```

---

## 7. Checkpoint 1 — Audience Approval

### What the marketer sees

```
┌──────────────────────────────────────────────────────────────┐
│ 🎯  Audience Found                                           │
├──────────────────────────────────────────────────────────────┤
│  421 customers match your goal                               │
│  "Dormant coffee buyers, inactive 60+ days"                  │
│                                                              │
│  Sample customers:                                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Name           Email                Last Order       │   │
│  │ Priya Sharma   priya@...            March 2, 2026     │   │
│  │ Arjun Mehta    arjun@...            Feb 28, 2026      │   │
│  │ Kavya Reddy    kavya@...            Feb 15, 2026      │   │
│  │ + 418 more                                            │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────┐  ┌──────────────────────┐  ┌──────────┐  │
│  │ ✓ Looks Good │  │ ✏️ Refine Audience   │  │ ✕ Cancel │  │
│  └──────────────┘  └──────────────────────┘  └──────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### "Refine Audience" interaction

Clicking "Refine Audience" opens an inline text input pre-filled with the AI's description:

```
┌──────────────────────────────────────────────────────────────┐
│ ✏️  Refine your audience                                     │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Customers who bought coffee but haven't ordered in 60   │ │
│ │ days                                            [← AI]  │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ Suggestions:                                                 │
│ • "narrow to Delhi customers only"                           │
│ • "only customers who spent ₹500+ in total"                  │
│ • "inactive 30 days instead of 60"                           │
│                                                              │
│  ┌──────────────────┐                                        │
│  │ 🔄 Re-run Segment │                                       │
│  └──────────────────┘                                        │
└──────────────────────────────────────────────────────────────┘
```

When "Re-run Segment" is clicked, the frontend calls `POST /orchestrator/:id/approve` with:

```json
{
  "checkpoint": "SEGMENT",
  "action": "edit",
  "editedDescription": "Customers who bought coffee in Delhi but haven't ordered in 30 days"
}
```

The backend re-runs the segment agent with the new description and returns to
`AWAITING_SEGMENT_APPROVAL` with the new count and sample.

---

## 8. Checkpoint 2 — Product Approval

### What the marketer sees

```
┌──────────────────────────────────────────────────────────────┐
│ 🛍️  Suggested Products                                       │
├──────────────────────────────────────────────────────────────┤
│  Primary Products                                            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ [✓] Cold Brew 500ml          ₹299  Coffee    [✕ Remove]│  │
│  │ [✓] Espresso Beans 250g      ₹449  Coffee    [✕ Remove]│  │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Cross-sell Suggestions                                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ [ ] Reusable Coffee Tumbler  ₹599  Accessories [+ Add]│  │
│  │ [ ] Oat Milk 1L              ₹89   Food        [+ Add]│  │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌──────────────┐  ┌──────────────────────┐  ┌──────────┐  │
│  │ ✓ Looks Good │  │ + Add Custom Product │  │ ✕ Cancel │  │
│  └──────────────┘  └──────────────────────┘  └──────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### Frontend component

```tsx
// components/campaigns/checkpoint-product.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ProductCheckpointProps {
  runId: string;
  productResult: ProductAgentOutput;
  onProceed: () => void;
}

export function ProductCheckpoint({ runId, productResult, onProceed }: ProductCheckpointProps) {
  const [primaryProducts, setPrimaryProducts] = useState(productResult.primaryProducts);
  const [crossSellAdded, setCrossSellAdded] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const removeProduct = (id: string) => {
    setPrimaryProducts((prev) => prev.filter((p) => p.id !== id));
  };

  const addCrossSell = (id: string) => {
    setCrossSellAdded((prev) => [...prev, id]);
  };

  const handleApprove = async () => {
    setIsSubmitting(true);
    const hasChanges =
      primaryProducts.length !== productResult.primaryProducts.length ||
      crossSellAdded.length > 0;

    const body = hasChanges
      ? {
          checkpoint: "PRODUCT",
          action: "edit",
          editedProducts: [
            // mark products that were removed
            ...productResult.primaryProducts
              .filter((p) => !primaryProducts.find((pp) => pp.id === p.id))
              .map((p) => ({ ...p, action: "remove" as const })),
            // mark products that were kept
            ...primaryProducts.map((p) => ({ ...p, action: "keep" as const })),
            // mark cross-sell products that were added
            ...productResult.crossSellSuggestions
              .filter((p) => crossSellAdded.includes(p.id))
              .map((p) => ({ ...p, action: "add" as const })),
          ],
        }
      : { checkpoint: "PRODUCT", action: "approve" };

    await fetch(`/api/orchestrator/${runId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    onProceed(); // tells parent to show "AI is writing message..." state
    setIsSubmitting(false);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-2xl">🛍️</span>
        <h3 className="text-lg font-semibold">Suggested Products</h3>
      </div>

      {/* Primary products */}
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground font-medium">Primary</p>
        {primaryProducts.map((product) => (
          <div key={product.id} className="flex items-center justify-between p-3 rounded-lg bg-muted">
            <div>
              <p className="font-medium text-sm">{product.name}</p>
              <p className="text-xs text-muted-foreground">₹{product.price} · {product.category}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeProduct(product.id)}
              className="text-destructive hover:text-destructive"
            >
              Remove
            </Button>
          </div>
        ))}
      </div>

      {/* Cross-sell suggestions */}
      {productResult.crossSellSuggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground font-medium">Add cross-sell?</p>
          {productResult.crossSellSuggestions.map((product) => (
            <div
              key={product.id}
              className="flex items-center justify-between p-3 rounded-lg border border-dashed border-border"
            >
              <div>
                <p className="font-medium text-sm">{product.name}</p>
                <p className="text-xs text-muted-foreground">₹{product.price} · {product.category}</p>
              </div>
              {crossSellAdded.includes(product.id) ? (
                <Badge variant="secondary">Added</Badge>
              ) : (
                <Button variant="outline" size="sm" onClick={() => addCrossSell(product.id)}>
                  + Add
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button onClick={handleApprove} disabled={isSubmitting} className="flex-1">
          {isSubmitting ? "Processing..." : "✓ Looks Good"}
        </Button>
      </div>
    </div>
  );
}
```

---

## 9. Checkpoint 3 — Message Approval

### What the marketer sees

```
┌──────────────────────────────────────────────────────────────┐
│ ✍️  Campaign Message                     Channel: WhatsApp   │
├──────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────┐    │
│  │  📱 WhatsApp Preview                                  │    │
│  │  ┌────────────────────────────────────────────────┐  │    │
│  │  │ BrewCraft Coffee                          9:41 │  │    │
│  │  │                                                │  │    │
│  │  │ Hey Priya! ☕ We miss you.                     │  │    │
│  │  │                                                │  │    │
│  │  │ Your Cold Brew is waiting. Grab your           │  │    │
│  │  │ favourite Cold Brew 500ml + Espresso           │  │    │
│  │  │ Beans — just for you, this week.               │  │    │
│  │  │                                                │  │    │
│  │  │ [Shop Now →]                                   │  │    │
│  │  └────────────────────────────────────────────────┘  │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌──────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ ✓ Looks Good │  │  ✏️ Edit Text   │  │ 🔄 Regenerate  │ │
│  └──────────────┘  └─────────────────┘  └─────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### The regenerate flow — marketer provides feedback

```
┌──────────────────────────────────────────────────────────────┐
│ 🔄  Regenerate Message                                       │
│                                                              │
│  Tell the AI what to change:                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Make it more urgent — add a 48-hour deadline         │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌────────────────────────┐                                  │
│  │  🔄 Generate New Draft  │                                 │
│  └────────────────────────┘                                  │
└──────────────────────────────────────────────────────────────┘
```

### Frontend component

```tsx
// components/campaigns/checkpoint-content.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ContentCheckpointProps {
  runId: string;
  contentResult: ContentAgentOutput;
  channel: string;
  onProceed: () => void;
}

type Mode = "preview" | "edit" | "regenerate";

export function ContentCheckpoint({ runId, contentResult, channel, onProceed }: ContentCheckpointProps) {
  const [mode, setMode] = useState<Mode>("preview");
  const [editedBody, setEditedBody] = useState(contentResult.body);
  const [editedSubject, setEditedSubject] = useState(contentResult.subject ?? "");
  const [regenerationFeedback, setRegenerationFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleApprove = async () => {
    setIsSubmitting(true);
    await fetch(`/api/orchestrator/${runId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkpoint: "CONTENT", action: "approve" }),
    });
    onProceed();
    setIsSubmitting(false);
  };

  const handleSaveEdit = async () => {
    setIsSubmitting(true);
    await fetch(`/api/orchestrator/${runId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkpoint: "CONTENT",
        action: "edit",
        editedMessage: editedBody,
        editedSubject: editedSubject || undefined,
      }),
    });
    onProceed();
    setIsSubmitting(false);
  };

  const handleRegenerate = async () => {
    if (!regenerationFeedback.trim()) return;
    setIsSubmitting(true);
    await fetch(`/api/orchestrator/${runId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkpoint: "CONTENT",
        action: "regenerate",
        regenerationFeedback,
      }),
    });
    // Don't call onProceed — we're re-running content agent
    // SSE will push the new AWAITING_CONTENT_APPROVAL state
    setIsSubmitting(false);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">✍️</span>
          <h3 className="text-lg font-semibold">Campaign Message</h3>
        </div>
        <span className="text-xs bg-muted px-2 py-1 rounded-full capitalize">{channel}</span>
      </div>

      {mode === "preview" && (
        <>
          <MessagePreview content={contentResult} channel={channel} />
          <div className="flex gap-3">
            <Button onClick={handleApprove} disabled={isSubmitting} className="flex-1">
              ✓ Looks Good
            </Button>
            <Button variant="outline" onClick={() => setMode("edit")}>
              ✏️ Edit
            </Button>
            <Button variant="outline" onClick={() => setMode("regenerate")}>
              🔄 Regenerate
            </Button>
          </div>
        </>
      )}

      {mode === "edit" && (
        <div className="space-y-3">
          {channel === "email" && (
            <div>
              <label className="text-sm font-medium">Subject line</label>
              <input
                className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                value={editedSubject}
                onChange={(e) => setEditedSubject(e.target.value)}
              />
            </div>
          )}
          <div>
            <label className="text-sm font-medium">Message</label>
            <Textarea
              className="mt-1 min-h-32"
              value={editedBody}
              onChange={(e) => setEditedBody(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">{editedBody.length} characters</p>
          </div>
          <div className="flex gap-3">
            <Button onClick={handleSaveEdit} disabled={isSubmitting}>Save & Continue</Button>
            <Button variant="ghost" onClick={() => setMode("preview")}>Cancel</Button>
          </div>
        </div>
      )}

      {mode === "regenerate" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Tell the AI what to change about this message:
          </p>
          <Textarea
            placeholder="e.g. Make it more urgent, add a 48-hour offer, use a friendlier tone..."
            value={regenerationFeedback}
            onChange={(e) => setRegenerationFeedback(e.target.value)}
            className="min-h-24"
          />
          <div className="flex gap-3">
            <Button
              onClick={handleRegenerate}
              disabled={isSubmitting || !regenerationFeedback.trim()}
            >
              {isSubmitting ? "Generating..." : "🔄 Generate New Draft"}
            </Button>
            <Button variant="ghost" onClick={() => setMode("preview")}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Channel-specific message preview component
function MessagePreview({ content, channel }: { content: ContentAgentOutput; channel: string }) {
  if (channel === "whatsapp" || channel === "sms" || channel === "rcs") {
    return (
      <div className="bg-[#ECE5DD] rounded-xl p-4 font-sans">
        <div className="bg-white rounded-xl p-3 shadow-sm max-w-xs">
          <p className="text-xs font-semibold text-[#128C7E] mb-1">BrewCraft Coffee</p>
          <p className="text-sm whitespace-pre-wrap">{content.body}</p>
          {content.cta && (
            <div className="mt-2 bg-[#128C7E] text-white text-xs text-center py-1.5 rounded-lg">
              {content.cta}
            </div>
          )}
          <p className="text-[10px] text-gray-400 text-right mt-1">9:41 ✓✓</p>
        </div>
      </div>
    );
  }

  // Email preview
  return (
    <div className="border border-border rounded-xl p-4 bg-white space-y-2">
      <p className="text-xs text-muted-foreground">Subject: <span className="font-medium text-foreground">{content.subject}</span></p>
      <hr />
      <p className="text-sm whitespace-pre-wrap">{content.body}</p>
      {content.cta && (
        <div className="inline-block bg-primary text-primary-foreground text-sm px-4 py-2 rounded-lg mt-2">
          {content.cta}
        </div>
      )}
    </div>
  );
}
```

---

## 10. Checkpoint 4 — Channel + Final Launch

### What the marketer sees

```
┌──────────────────────────────────────────────────────────────────┐
│ 🚀  Ready to Launch                                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Campaign Summary                                                │
│  ─────────────────────────────────────────────────────────────  │
│  Audience     421 dormant coffee buyers (60+ days inactive)     │
│  Products     Cold Brew 500ml, Espresso Beans 250g              │
│  Message      "Hey {name}! ☕ We miss you. Your Cold Brew..."    │
│  Channel      WhatsApp  ████████░░  82% confidence              │
│               ↳ "WhatsApp had 3x higher CTR than email in       │
│                  previous coffee campaigns"                      │
│                                                                  │
│  Change channel?  ○ WhatsApp  ○ Email  ○ SMS  ○ RCS             │
│                                                                  │
│  Schedule?    ○ Send now  ○ Schedule for later                   │
│               [📅 Jun 11, 2026  🕘 09:00 AM]                    │
│                                                                  │
│  ┌──────────────────────┐  ┌──────────────────┐                 │
│  │  🚀 Launch Campaign  │  │  ✕ Cancel        │                 │
│  └──────────────────────┘  └──────────────────┘                 │
└──────────────────────────────────────────────────────────────────┘
```

---

## 11. Frontend: The Step-by-Step Review UI

### The main orchestrator page — drives the entire flow

```tsx
// app/(dashboard)/campaigns/new/page.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { SegmentCheckpoint } from "@/components/campaigns/checkpoint-segment";
import { ProductCheckpoint } from "@/components/campaigns/checkpoint-product";
import { ContentCheckpoint } from "@/components/campaigns/checkpoint-content";
import { LaunchCheckpoint } from "@/components/campaigns/checkpoint-launch";
import { ThinkingPanel } from "@/components/campaigns/thinking-panel";

type UIStage =
  | "input"              // marketer typing goal
  | "thinking"           // AI running agents
  | "segment_review"     // checkpoint 1
  | "product_review"     // checkpoint 2
  | "content_review"     // checkpoint 3
  | "launch_review"      // checkpoint 4
  | "launching"          // post-approval, jobs being enqueued
  | "done";              // campaign live

interface OrchestratorStep {
  type: "thinking" | "checkpoint" | "tool_call" | "tool_result";
  message?: string;
  checkpoint?: string;
  data?: unknown;
  timestamp: Date;
}

export default function NewCampaignPage() {
  const [stage, setStage] = useState<UIStage>("input");
  const [goal, setGoal] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [runData, setRunData] = useState<Record<string, unknown>>({});
  const [thinkingSteps, setThinkingSteps] = useState<OrchestratorStep[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Start the orchestrator run
  const handleStart = async () => {
    if (!goal.trim()) return;
    setStage("thinking");

    const response = await fetch("/api/orchestrator/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal }),
    });
    const { runId: newRunId } = await response.json();
    setRunId(newRunId);

    // Start the stage 1 execution (async on server)
    await fetch(`/api/orchestrator/${newRunId}/run-stage`, {
      method: "POST",
      body: JSON.stringify({ stage: 1 }),
    });

    // Open SSE stream to receive checkpoint events
    openSSEStream(newRunId);
  };

  const openSSEStream = (id: string) => {
    // Close any existing stream
    eventSourceRef.current?.close();

    const es = new EventSource(`/api/orchestrator/${id}/stream`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "step") {
        setThinkingSteps((prev) => [...prev, data.step]);
      }

      // Status transitions from the server
      if (data.type === "status_change") {
        setRunData(data.runData);

        switch (data.status) {
          case "AWAITING_SEGMENT_APPROVAL":
            setStage("segment_review");
            break;
          case "AWAITING_PRODUCT_APPROVAL":
            setStage("product_review");
            break;
          case "AWAITING_CONTENT_APPROVAL":
            setStage("content_review");
            break;
          case "AWAITING_LAUNCH_APPROVAL":
            setStage("launch_review");
            break;
          case "RUNNING":
            setStage("thinking");
            break;
          case "COMPLETED":
            setStage("done");
            es.close();
            break;
          case "FAILED":
            // Show error state
            break;
        }
      }
    };
  };

  // Called after any checkpoint approval to show "thinking" while next stage runs
  const handleCheckpointProceed = () => {
    setStage("thinking");
  };

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      {/* Goal input */}
      {stage === "input" && (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">New Campaign</h1>
          <p className="text-muted-foreground">
            Describe your marketing goal in plain English. The AI will do the rest.
          </p>
          <textarea
            className="w-full h-28 px-4 py-3 rounded-xl border border-border bg-background resize-none text-sm"
            placeholder="e.g. Bring back dormant coffee customers who haven't ordered in 60 days"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
          <button
            onClick={handleStart}
            disabled={!goal.trim()}
            className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-medium disabled:opacity-50"
          >
            Start Planning →
          </button>
        </div>
      )}

      {/* Thinking panel — shown between checkpoints */}
      {(stage === "thinking" || stage === "launching") && (
        <ThinkingPanel steps={thinkingSteps} />
      )}

      {/* Checkpoint UIs — shown when paused */}
      {stage === "segment_review" && runId && (
        <SegmentCheckpoint
          runId={runId}
          segmentResult={runData.segmentResult as SegmentAgentOutput}
          onProceed={handleCheckpointProceed}
        />
      )}

      {stage === "product_review" && runId && (
        <ProductCheckpoint
          runId={runId}
          productResult={runData.productResult as ProductAgentOutput}
          onProceed={handleCheckpointProceed}
        />
      )}

      {stage === "content_review" && runId && (
        <ContentCheckpoint
          runId={runId}
          contentResult={runData.contentResult as ContentAgentOutput}
          channel={(runData.channelHint as string) ?? "whatsapp"}
          onProceed={handleCheckpointProceed}
        />
      )}

      {stage === "launch_review" && runId && (
        <LaunchCheckpoint
          runId={runId}
          executionPlan={runData.executionPlan as ExecutionPlan}
          channelResult={runData.channelResult as ChannelAgentOutput}
          onProceed={() => setStage("launching")}
        />
      )}

      {stage === "done" && (
        <div className="text-center py-12 space-y-3">
          <div className="text-5xl">🚀</div>
          <h2 className="text-xl font-semibold">Campaign Launched!</h2>
          <p className="text-muted-foreground">Messages are being sent. Watch the analytics live.</p>
          <a href={`/campaigns/${runData.campaignId}`} className="inline-block bg-primary text-primary-foreground px-6 py-2 rounded-xl">
            View Analytics →
          </a>
        </div>
      )}
    </div>
  );
}
```

### The thinking panel

```tsx
// components/campaigns/thinking-panel.tsx
"use client";

import { motion, AnimatePresence } from "framer-motion";

interface ThinkingPanelProps {
  steps: OrchestratorStep[];
}

export function ThinkingPanel({ steps }: ThinkingPanelProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
        <p className="text-sm font-medium text-muted-foreground">AI is planning your campaign...</p>
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        <AnimatePresence>
          {steps.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2 text-sm"
            >
              <span className="text-muted-foreground shrink-0 mt-0.5 text-xs">
                {new Date(step.timestamp).toLocaleTimeString()}
              </span>
              <span className={step.type === "checkpoint" ? "font-medium" : "text-muted-foreground"}>
                {step.message}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
```

---

## 12. SSE: Streaming Pauses to the Browser

The SSE stream serves two purposes:
1. Forward thinking steps (tool calls, reasoning) as they happen
2. Send status change events when the orchestrator pauses at a checkpoint

```typescript
// app/api/orchestrator/[runId]/stream/route.ts

export async function GET(
  _req: NextRequest,
  { params }: { params: { runId: string } }
) {
  const encoder = new TextEncoder();
  let lastStatus: string | null = null;
  let lastStepCount = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const interval = setInterval(async () => {
        const run = await db.orchestratorRun.findUnique({
          where: { id: params.runId },
          select: {
            status: true,
            steps: true,
            segmentResult: true,
            productResult: true,
            contentResult: true,
            channelResult: true,
            executionPlan: true,
            campaignId: true,
            error: true,
          },
        });

        if (!run) {
          clearInterval(interval);
          controller.close();
          return;
        }

        // Stream new steps (thinking events)
        const allSteps = run.steps as OrchestratorStep[];
        const newSteps = allSteps.slice(lastStepCount);
        if (newSteps.length > 0) {
          newSteps.forEach((step) => send({ type: "step", step }));
          lastStepCount = allSteps.length;
        }

        // Stream status change events (checkpoint arrivals)
        if (run.status !== lastStatus) {
          lastStatus = run.status;
          send({
            type: "status_change",
            status: run.status,
            // Send the relevant data for the new checkpoint
            runData: {
              segmentResult: run.segmentResult,
              productResult: run.productResult,
              contentResult: run.contentResult,
              channelResult: run.channelResult,
              executionPlan: run.executionPlan,
              campaignId: run.campaignId,
            },
          });
        }

        // Close when terminal
        const TERMINAL_STATES = ["COMPLETED", "FAILED", "CANCELLED"];
        if (TERMINAL_STATES.includes(run.status)) {
          clearInterval(interval);
          controller.close();
        }
      }, 500);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

---

## 13. Edit Flows — What the Marketer Can Change

Summary of every edit action and what happens on the backend:

| Checkpoint | Action | What happens |
|---|---|---|
| Segment | Approve | Stage 2 starts immediately (product agent) |
| Segment | Edit description | Segment agent re-runs with new text → new count → back to checkpoint 1 |
| Segment | Cancel | Run marked CANCELLED |
| Product | Approve | Stage 3 starts (content agent uses original product list) |
| Product | Remove product(s) | Edited list stored, stage 3 starts with edited list, no agent re-run |
| Product | Add cross-sell | Same as above |
| Product | Cancel | Run marked CANCELLED |
| Content | Approve | Stage 4 starts (channel agent) |
| Content | Edit text | Edited text stored verbatim, stage 4 starts, no agent re-run |
| Content | Regenerate | Content agent re-runs with feedback → new message → back to checkpoint 3 |
| Content | Cancel | Run marked CANCELLED |
| Launch | Launch (no changes) | Campaign created, jobs enqueued, run marked COMPLETED |
| Launch | Override channel | Channel override stored, campaign uses override channel |
| Launch | Schedule later | `scheduledAt` set on campaign, BullMQ job delayed |
| Launch | Cancel | Run marked CANCELLED |

---

## 14. Complexity Analysis

### What this adds

| Component | New complexity introduced |
|---|---|
| OrchestratorRun DB schema | 4 new JSON columns (edit results), 1 new enum column, 1 FK to campaign |
| Stage runner functions | 4 async functions (runStage1–4) instead of 1 orchestrator function |
| Approve endpoint | Discriminated union validation with 8 different action branches |
| SSE stream | Extended with `status_change` events on top of `step` events |
| Frontend state machine | 8 UI stages managed in a single page with SSE-driven transitions |
| Frontend components | 4 checkpoint components + 1 thinking panel |

### What this does NOT add (intentionally kept simple)

- **No separate queue for stages** — stage transitions are triggered directly by HTTP calls, not by a background job system. At assignment scale this is correct.
- **No WebSocket** — SSE is sufficient and simpler. Real-time feels fast with 500ms polling.
- **No optimistic updates** — checkpoint approvals wait for server confirmation before transitioning the UI. Safer.
- **No concurrent HITL** — one marketer per run. No conflict resolution needed.

### Honest tradeoffs to state in your video

> "At scale, I'd move the stage runners into BullMQ jobs to handle long-running agents
> without HTTP timeout risk. The SSE polling interval of 500ms works for a demo but
> would be replaced with Postgres LISTEN/NOTIFY in production for true push-based updates.
> The current approach keeps all complexity in one place which made it faster to ship
> and easier to debug."

---

## 15. Full Code Reference

### New API routes added

```
POST /api/orchestrator/start                     → creates OrchestratorRun, returns runId
POST /api/orchestrator/[runId]/run-stage         → triggers the next stage (stage: 1|2|3|4)
POST /api/orchestrator/[runId]/approve           → approves/edits/cancels a checkpoint
GET  /api/orchestrator/[runId]/stream            → SSE stream of steps + status changes
GET  /api/orchestrator/[runId]                   → get current run state (for page refresh)
```

### New file tree additions

```
lib/agents/
├── orchestrator-stages.ts     ← Stage 1–4 runners + launchCampaign
├── orchestrator-events.ts     ← emitStep helper
└── tool-executor.ts           ← unchanged

app/api/orchestrator/
├── start/route.ts             ← POST — creates run
├── [runId]/
│   ├── run-stage/route.ts     ← POST — triggers stage execution
│   ├── approve/route.ts       ← POST — handles all checkpoint approvals
│   ├── stream/route.ts        ← GET SSE — streams steps + status
│   └── route.ts               ← GET — fetch current run state

components/campaigns/
├── checkpoint-segment.tsx
├── checkpoint-product.tsx
├── checkpoint-content.tsx
├── checkpoint-launch.tsx
└── thinking-panel.tsx

app/(dashboard)/campaigns/
└── new/page.tsx               ← Main campaign creation page (full state machine)
```

---

*This document is part of the Xeno CRM coding agent guidelines.*
*Read alongside CODING_GUIDELINES.md and AI_ORCHESTRATOR_AND_MEMORY.md.*
*Last updated: June 2026*
