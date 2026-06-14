import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db/client";
import { getAnalyticsSnapshot } from "@/lib/db/queries/analytics";
import { TrendingUp, BarChart3 } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Analytics",
  description: "Nike CRM campaign performance analytics",
};

export default async function AnalyticsPage() {
  const campaigns = await db.campaign.findMany({
    where: { status: { in: ["COMPLETED", "RUNNING"] } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const analyticsData = await Promise.all(
    campaigns.map(async (c: any) => ({
      campaign: c,
      stats: await getAnalyticsSnapshot(c.id),
    }))
  );

  const totalSent = analyticsData.reduce((sum, d) => sum + d.stats.totalSent, 0);
  const avgCtr = analyticsData.length > 0
    ? analyticsData.reduce((sum, d) => sum + d.stats.ctr, 0) / analyticsData.length
    : 0;
  const avgOpenRate = analyticsData.length > 0
    ? analyticsData.reduce((sum, d) => sum + d.stats.openRate, 0) / analyticsData.length
    : 0;

  return (
    <div>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ marginBottom: "0.375rem" }}>
          <span className="text-gradient">Analytics</span>
        </h1>
        <p style={{ color: "var(--text-secondary)" }}>
          Cross-campaign performance overview for Nike
        </p>
      </div>

      {/* Summary metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
        {[
          { label: "Total Messages Sent", value: totalSent.toLocaleString(), color: "var(--text-primary)" },
          { label: "Avg. Open Rate", value: `${avgOpenRate.toFixed(1)}%`, color: "var(--accent-secondary)" },
          { label: "Avg. CTR", value: `${avgCtr.toFixed(1)}%`, color: "var(--accent-primary)" },
        ].map((m) => (
          <div key={m.label} className="metric-card">
            <div className="metric-label">{m.label}</div>
            <div className="metric-value" style={{ color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Per-campaign table */}
      {analyticsData.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "4rem" }}>
          <BarChart3 size={48} color="var(--text-muted)" style={{ margin: "0 auto 1rem" }} />
          <h3 style={{ color: "var(--text-muted)" }}>No completed campaigns yet</h3>
          <p style={{ color: "var(--text-muted)", marginTop: "0.5rem", fontSize: "0.875rem" }}>
            Launch a campaign to see analytics here
          </p>
          <Link href="/campaigns/new" className="btn btn-primary" style={{ marginTop: "1.5rem" }}>
            Create Campaign
          </Link>
        </div>
      ) : (
        <div className="card">
          <h3 style={{ marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <TrendingUp size={18} color="var(--accent-primary)" />
            Campaign Performance
          </h3>
          <div style={{ borderRadius: "8px", overflow: "hidden", border: "1px solid var(--border)" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Channel</th>
                  <th>Sent</th>
                  <th>Delivery</th>
                  <th>Open Rate</th>
                  <th>CTR</th>
                  <th>Converted</th>
                </tr>
              </thead>
              <tbody>
                {analyticsData.map(({ campaign, stats }) => (
                  <tr key={campaign.id}>
                    <td>
                      <Link
                        href={`/campaigns/${campaign.id}`}
                        style={{ color: "var(--text-primary)", fontWeight: 600, textDecoration: "none" }}
                      >
                        {campaign.name.slice(0, 40)}...
                      </Link>
                    </td>
                    <td>
                      <span className="badge badge-muted">{campaign.channel.toUpperCase()}</span>
                    </td>
                    <td>{stats.totalSent.toLocaleString()}</td>
                    <td style={{ color: stats.deliveryRate > 70 ? "var(--accent-green)" : "var(--accent-amber)" }}>
                      {stats.deliveryRate}%
                    </td>
                    <td style={{ color: stats.openRate > 25 ? "var(--accent-green)" : "var(--text-secondary)" }}>
                      {stats.openRate}%
                    </td>
                    <td style={{ color: "var(--accent-primary)", fontWeight: 600 }}>
                      {stats.ctr}%
                    </td>
                    <td style={{ color: "var(--accent-green)" }}>
                      {stats.converted.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
