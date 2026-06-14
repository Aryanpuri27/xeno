import { NextRequest, NextResponse } from "next/server";
import { getCampaignsWithStats } from "@/lib/db/queries/campaigns";
import { handleApiError } from "@/lib/utils/errors";

export async function GET(_req: NextRequest) {
  try {
    const campaigns = await getCampaignsWithStats(50);
    return NextResponse.json({ data: campaigns });
  } catch (error) {
    return handleApiError(error);
  }
}
