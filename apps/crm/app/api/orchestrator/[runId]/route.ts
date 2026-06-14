import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { handleApiError, NotFoundError } from "@/lib/utils/errors";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const run = await db.orchestratorRun.findUnique({
      where: { id: runId },
    });
    if (!run) throw new NotFoundError(`Orchestrator run ${runId} not found`);
    return NextResponse.json({ data: run });
  } catch (error) {
    return handleApiError(error);
  }
}
