import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { handleApiError, NotFoundError } from "@/lib/utils/errors";
import type { OrchestratorStep } from "@/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const encoder = new TextEncoder();
    let lastStatus: string | null = null;
    let lastStepCount = 0;
    let closed = false; // guard: prevent enqueue after close

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: object) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            // stream already closed by client disconnect — swallow
          }
        };

        const close = () => {
          if (closed) return;
          closed = true;
          clearInterval(interval);
          try { controller.close(); } catch { /* already closed */ }
        };

        const interval = setInterval(async () => {
          if (closed) return;
          try {
            const run = await db.orchestratorRun.findUnique({
              where: { id: runId },
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

            if (!run) { close(); return; }

            // Stream new thinking steps since last poll
            const allSteps = (run.steps as unknown as OrchestratorStep[]) ?? [];
            const newSteps = allSteps.slice(lastStepCount);
            if (newSteps.length > 0) {
              newSteps.forEach((step) => send({ type: "step", step }));
              lastStepCount = allSteps.length;
            }

            // Stream status change events
            if (run.status !== lastStatus) {
              lastStatus = run.status;
              send({
                type: "status_change",
                status: run.status,
                runData: {
                  segmentResult: run.segmentResult,
                  productResult: run.productResult,
                  contentResult: run.contentResult,
                  channelResult: run.channelResult,
                  executionPlan: run.executionPlan,
                  campaignId: run.campaignId,
                  error: run.error,
                },
              });
            }

            // Close on terminal state
            if (["COMPLETED", "FAILED", "CANCELLED"].includes(run.status)) {
              close();
            }
          } catch {
            close();
          }
        }, 500);
      },

      cancel() {
        // Client disconnected — mark closed so interval stops on next tick
        closed = true;
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
