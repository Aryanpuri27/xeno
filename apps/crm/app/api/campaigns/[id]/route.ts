import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { handleApiError, NotFoundError } from "@/lib/utils/errors";
import { getAnalyticsSnapshot } from "@/lib/db/queries/analytics";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const campaign = await db.campaign.findUnique({
      where: { id },
      include: { _count: { select: { communications: true } } },
    });
    if (!campaign) throw new NotFoundError(`Campaign ${id} not found`);
    const analytics = await getAnalyticsSnapshot(id);
    return NextResponse.json({ data: { campaign, analytics } });
  } catch (error) {
    return handleApiError(error);
  }
}
