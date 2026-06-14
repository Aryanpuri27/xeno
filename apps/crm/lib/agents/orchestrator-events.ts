import { db } from "@/lib/db/client";
import { logger } from "@/lib/utils/logger";
import type { OrchestratorStep } from "@/types";

// Human-readable labels shown in the thinking panel for each tool call
const TOOL_LABELS: Record<string, string> = {
  get_campaign_memory: "Reviewing past Nike campaign learnings...",
  run_segment_agent: "Finding your target audience...",
  run_product_agent: "Selecting relevant Nike products...",
  run_content_agent: "Writing your campaign message...",
  run_channel_agent: "Choosing the best channel...",
};

/**
 * Emit an orchestrator step to the DB — SSE endpoint polls this to stream to the browser.
 * The marketer sees live AI thinking updates as each agent runs.
 *
 * NOTE: We use a read-modify-write pattern instead of Prisma's { push } operator
 * because { push } on a Json[] field can corrupt 4-byte Unicode characters (emoji)
 * in some Prisma/PostgreSQL configurations.
 */
export async function emitStep(
  runId: string,
  event: Omit<OrchestratorStep, "timestamp">
): Promise<void> {
  const step: OrchestratorStep = {
    ...event,
    message: event.message ?? (event.tool ? TOOL_LABELS[event.tool] : undefined),
    timestamp: new Date().toISOString(),
  };

  try {
    // Read current steps, append, write back — avoids Prisma JSON push emoji corruption
    const run = await db.orchestratorRun.findUnique({
      where: { id: runId },
      select: { steps: true },
    });
    const currentSteps = (run?.steps as unknown as OrchestratorStep[] | null) ?? [];
    const updatedSteps = [...currentSteps, step];

    await db.orchestratorRun.update({
      where: { id: runId },
      data: {
        steps: updatedSteps as object[],
        updatedAt: new Date(),
      },
    });
    logger.debug({ runId, stepType: step.type, msg: step.message }, "Orchestrator step emitted");
  } catch (err) {
    // Non-fatal — if we can't emit a step, log it but don't crash the agent
    logger.warn({ runId, err }, "Failed to emit orchestrator step");
  }
}
