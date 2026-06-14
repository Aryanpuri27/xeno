import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { handleApiError, NotFoundError } from "@/lib/utils/errors";
import {
  runStage1_Segment,
  runStage2_Products,
  runStage3_Content,
  runStage4_Channel,
  handleStageError,
} from "@/lib/agents/orchestrator-stages";

const RunStageSchema = z.object({
  stage: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});

// Used for recovery/retry — allows manually triggering a specific stage
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const body = await request.json();
    const { stage } = RunStageSchema.parse(body);

    const run = await db.orchestratorRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundError(`Run ${runId} not found`);

    // Reset status to RUNNING so SSE re-opens
    await db.orchestratorRun.update({
      where: { id: runId },
      data: { status: "RUNNING" },
    });

    switch (stage) {
      case 1:
        runStage1_Segment(runId).catch((err) => handleStageError(runId, err, "stage1"));
        break;
      case 2:
        runStage2_Products(runId).catch((err) => handleStageError(runId, err, "stage2"));
        break;
      case 3:
        runStage3_Content(runId).catch((err) => handleStageError(runId, err, "stage3"));
        break;
      case 4:
        runStage4_Channel(runId).catch((err) => handleStageError(runId, err, "stage4"));
        break;
    }

    return NextResponse.json({ status: "triggered", stage });
  } catch (error) {
    return handleApiError(error);
  }
}
