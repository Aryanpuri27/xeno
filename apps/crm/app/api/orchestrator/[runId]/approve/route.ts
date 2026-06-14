import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { handleApiError, NotFoundError } from "@/lib/utils/errors";
import {
  runStage1_Segment,
  runStage2_Products,
  runStage3_Content,
  runStage4_Channel,
  launchCampaign,
  handleStageError,
} from "@/lib/agents/orchestrator-stages";
import type { ProductAgentOutput, ContentAgentOutput, ExecutionPlan } from "@/types";

// Discriminated union — each checkpoint has a different action set
const ApproveSchema = z.discriminatedUnion("checkpoint", [
  z.object({
    checkpoint: z.literal("SEGMENT"),
    action: z.enum(["approve", "edit", "cancel"]),
    editedDescription: z.string().optional(),
    editedSQL: z.string().optional(),
  }),
  z.object({
    checkpoint: z.literal("PRODUCT"),
    action: z.enum(["approve", "edit", "cancel"]),
    editedProducts: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          action: z.enum(["keep", "remove", "add"]),
        })
      )
      .optional(),
  }),
  z.object({
    checkpoint: z.literal("CONTENT"),
    action: z.enum(["approve", "edit", "regenerate", "cancel"]),
    editedMessage: z.string().optional(),
    editedSubject: z.string().optional(),
    regenerationFeedback: z.string().optional(),
  }),
  z.object({
    checkpoint: z.literal("LAUNCH"),
    action: z.enum(["launch", "cancel"]),
    channelOverride: z.enum(["whatsapp", "email", "sms", "rcs"]).optional(),
    scheduledAt: z.coerce.date().optional(),
  }),
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const body = await request.json();
    const input = ApproveSchema.parse(body);

    const run = await db.orchestratorRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundError(`Orchestrator run ${runId} not found`);

    // ── Cancel at any step ────────────────────────────────────────────────────
    if (input.action === "cancel") {
      await db.orchestratorRun.update({
        where: { id: runId },
        data: { status: "CANCELLED" },
      });
      return NextResponse.json({ status: "cancelled" });
    }

    // ── Checkpoint 1: Segment ─────────────────────────────────────────────────
    if (input.checkpoint === "SEGMENT") {
      if (input.action === "approve") {
        runStage2_Products(runId).catch((err) =>
          handleStageError(runId, err, "stage2_products")
        );
        return NextResponse.json({ status: "proceeding", nextCheckpoint: "PRODUCT" });
      }

      if (input.action === "edit" && input.editedDescription) {
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
        // Re-run segment agent with new description
        runStage1_Segment(runId, input.editedDescription).catch((err) =>
          handleStageError(runId, err, "stage1_segment_retry")
        );
        return NextResponse.json({ status: "rerunning", checkpoint: "SEGMENT" });
      }
    }

    // ── Checkpoint 2: Products ────────────────────────────────────────────────
    if (input.checkpoint === "PRODUCT") {
      if (input.action === "approve") {
        runStage3_Content(runId).catch((err) =>
          handleStageError(runId, err, "stage3_content")
        );
        return NextResponse.json({ status: "proceeding", nextCheckpoint: "CONTENT" });
      }

      if (input.action === "edit" && input.editedProducts) {
        const currentProducts = run.productResult as unknown as ProductAgentOutput;
        const editedProductResult = applyProductEdits(currentProducts, input.editedProducts);
        await db.orchestratorRun.update({
          where: { id: runId },
          data: { productEdits: editedProductResult as object },
        });
        runStage3_Content(runId).catch((err) =>
          handleStageError(runId, err, "stage3_content_after_product_edit")
        );
        return NextResponse.json({ status: "proceeding", nextCheckpoint: "CONTENT" });
      }
    }

    // ── Checkpoint 3: Content ─────────────────────────────────────────────────
    if (input.checkpoint === "CONTENT") {
      if (input.action === "approve") {
        runStage4_Channel(runId).catch((err) =>
          handleStageError(runId, err, "stage4_channel")
        );
        return NextResponse.json({ status: "proceeding", nextCheckpoint: "LAUNCH" });
      }

      if (input.action === "edit" && (input.editedMessage ?? input.editedSubject)) {
        const currentContent = run.contentResult as unknown as ContentAgentOutput;
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
          handleStageError(runId, err, "stage4_channel_after_content_edit")
        );
        return NextResponse.json({ status: "proceeding", nextCheckpoint: "LAUNCH" });
      }

      if (input.action === "regenerate") {
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

    // ── Checkpoint 4: Launch ──────────────────────────────────────────────────
    if (input.checkpoint === "LAUNCH" && input.action === "launch") {
      if (input.channelOverride) {
        const currentPlan = run.executionPlan as unknown as ExecutionPlan;
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

      await launchCampaign(runId, input.scheduledAt);
      return NextResponse.json({ status: "launched" });
    }

    return NextResponse.json(
      { error: { code: "INVALID_ACTION", message: "Unhandled action combination" } },
      { status: 400 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function applyProductEdits(
  current: ProductAgentOutput,
  edits: Array<{ id: string; name: string; action: "keep" | "remove" | "add" }>
): ProductAgentOutput {
  const toRemove = new Set(
    edits.filter((e) => e.action === "remove").map((e) => e.id)
  );
  const toAdd = edits
    .filter((e) => e.action === "add")
    .map((e) => ({
      id: e.id,
      name: e.name,
      category: "manual",
      price: 0,
      description: "Manually added by marketer",
    }));

  return {
    ...current,
    primaryProducts: [
      ...current.primaryProducts.filter((p) => !toRemove.has(p.id)),
      ...toAdd,
    ],
  };
}
