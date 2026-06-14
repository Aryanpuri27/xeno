import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { handleApiError } from "@/lib/utils/errors";
import { runStage1_Segment, handleStageError } from "@/lib/agents/orchestrator-stages";
import { createId } from "@paralleldrive/cuid2";

const StartSchema = z.object({
  goal: z.string().min(5, "Goal must be at least 5 characters").max(500),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { goal } = StartSchema.parse(body);

    // Create the OrchestratorRun record immediately — returns runId to the client
    const run = await db.orchestratorRun.create({
      data: {
        id: createId(),
        goal,
        status: "RUNNING",
        steps: [],
      },
    });

    // Start stage 1 async — do NOT await (client should not wait 30s for a response)
    // Stage 1 will update DB status; SSE stream will push the update to the browser
    runStage1_Segment(run.id).catch((err) =>
      handleStageError(run.id, err, "stage1_segment")
    );

    return NextResponse.json({ runId: run.id, status: "RUNNING" }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
