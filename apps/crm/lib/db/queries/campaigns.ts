import { db } from "@/lib/db/client";
import type { Campaign } from "@prisma/client";

export async function getCampaignById(id: string): Promise<Campaign | null> {
  return db.campaign.findUnique({ where: { id } });
}

export async function getCampaignsWithStats(limit = 20) {
  return db.campaign.findMany({
    take: limit,
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { communications: true } },
    },
  });
}
