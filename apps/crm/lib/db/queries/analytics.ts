import { db } from "@/lib/db/client";
import type { AnalyticsSnapshot } from "@/types";

export async function getAnalyticsSnapshot(campaignId: string): Promise<AnalyticsSnapshot> {
  // Single aggregation query — not 7 separate counts.
  // NOTE: Prisma uses PascalCase table names and camelCase column names (all quoted).
  //   "Communication"      not  communications
  //   "CommunicationEvent" not  communication_events
  //   "campaignId"         not  campaign_id
  //   "communicationId"    not  communication_id
  //   "eventType"          not  event_type
  const stats = await db.$queryRaw<
    Array<{
      total: bigint;
      delivered: bigint;
      failed: bigint;
      bounced: bigint;
      opened: bigint;
      clicked: bigint;
      converted: bigint;
    }>
  >`
    SELECT
      COUNT(DISTINCT comm.id)::bigint                                                        AS total,
      COUNT(DISTINCT CASE WHEN ce."eventType" = 'DELIVERED'  THEN comm.id END)::bigint      AS delivered,
      COUNT(DISTINCT CASE WHEN ce."eventType" = 'FAILED'     THEN comm.id END)::bigint      AS failed,
      COUNT(DISTINCT CASE WHEN ce."eventType" = 'BOUNCED'    THEN comm.id END)::bigint      AS bounced,
      COUNT(DISTINCT CASE WHEN ce."eventType" = 'OPENED'     THEN comm.id END)::bigint      AS opened,
      COUNT(DISTINCT CASE WHEN ce."eventType" = 'CLICKED'    THEN comm.id END)::bigint      AS clicked,
      COUNT(DISTINCT CASE WHEN ce."eventType" = 'CONVERTED'  THEN comm.id END)::bigint      AS converted
    FROM "Communication" comm
    LEFT JOIN "CommunicationEvent" ce ON ce."communicationId" = comm.id
    WHERE comm."campaignId" = ${campaignId}
  `;

  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { status: true },
  });

  const row = stats[0];
  const totalSent    = Number(row?.total     ?? 0);
  const delivered    = Number(row?.delivered ?? 0);
  const failed       = Number(row?.failed    ?? 0);
  const bounced      = Number(row?.bounced   ?? 0);
  const opened       = Number(row?.opened    ?? 0);
  const clicked      = Number(row?.clicked   ?? 0);
  const converted    = Number(row?.converted ?? 0);

  const deliveryRate   = totalSent > 0 ? (delivered / totalSent) * 100 : 0;
  const openRate       = delivered > 0 ? (opened    / delivered) * 100 : 0;
  const ctr            = opened    > 0 ? (clicked   / opened)    * 100 : 0;
  const conversionRate = clicked   > 0 ? (converted / clicked)   * 100 : 0;

  return {
    campaignId,
    status: campaign?.status ?? "RUNNING",
    totalSent,
    delivered,
    failed,
    bounced,
    opened,
    clicked,
    converted,
    deliveryRate:   Math.round(deliveryRate   * 10) / 10,
    openRate:       Math.round(openRate       * 10) / 10,
    ctr:            Math.round(ctr            * 10) / 10,
    conversionRate: Math.round(conversionRate * 10) / 10,
  };
}
