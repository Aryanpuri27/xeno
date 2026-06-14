import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db/client";
import { getAnalyticsSnapshot } from "@/lib/db/queries/analytics";
import { getCampaignsWithStats } from "@/lib/db/queries/campaigns";
import {
  TrendingUp,
  Megaphone,
  Plus,
  Sparkles,
  BarChart3,
  Database,
  Cpu,
  CheckCircle,
  Activity,
  ArrowRight,
  Send,
  Zap,
} from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Nike CRM agentic orchestration control center",
};

export default async function DashboardPage() {
  // 1. Fetch campaigns and compute overall system metrics
  const campaigns = await getCampaignsWithStats(50);
  const activeCampaigns = campaigns.filter((c) => c.status === "RUNNING");
  const completedCampaigns = campaigns.filter((c) => c.status === "COMPLETED");

  // Fetch stats for all running/completed campaigns to calculate global metrics
  const analyticsData = await Promise.all(
    campaigns
      .filter((c) => ["COMPLETED", "RUNNING"].includes(c.status))
      .map(async (c) => ({
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

  // Recent 5 campaigns
  const recentCampaigns = campaigns.slice(0, 5);

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "1rem 0" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2.5rem" }}>
        <div>
          <h1 style={{ marginBottom: "0.5rem" }}>
            <span className="text-gradient">Control Center</span>
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
            Welcome back, Nike Campaign Director. Manage agentic pipelines and system conversions.
          </p>
        </div>
        <Link href="/campaigns/new" className="btn btn-primary">
          <Plus size={16} strokeWidth={2.5} />
          New Campaign
        </Link>
      </div>

      {/* Grid: 3 Stats Cards + 1 Health Panel */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
        {[
          {
            label: "Total Messages Sent",
            value: totalSent.toLocaleString(),
            color: "var(--text-primary)",
            desc: "Across all active campaigns",
            icon: Send,
          },
          {
            label: "Average Open Rate",
            value: `${avgOpenRate.toFixed(1)}%`,
            color: "var(--accent-secondary)",
            desc: "Delivery read-receipt metrics",
            icon: Activity,
          },
          {
            label: "Average Click Rate",
            value: `${avgCtr.toFixed(1)}%`,
            color: "var(--accent-primary)",
            desc: "Click-through performance",
            icon: TrendingUp,
          },
        ].map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.label} className="metric-card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "130px", padding: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <span className="metric-label" style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>{m.label}</span>
                <Icon size={16} color="var(--text-muted)" />
              </div>
              <div>
                <div className="metric-value" style={{ color: m.color, fontSize: "1.875rem", lineHeight: 1.2, fontWeight: 850 }}>{m.value}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>{m.desc}</div>
              </div>
            </div>
          );
        })}

        {/* System Health Widget */}
        <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "130px", padding: "1.25rem", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>System Status</span>
            <Cpu size={16} color="var(--accent-green)" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem" }}>
              <span className="status-dot running" style={{ width: "6px", height: "6px", background: "var(--accent-green)" }} />
              <span style={{ color: "var(--text-secondary)" }}>Worker:</span>
              <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>Active</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem" }}>
              <span className="status-dot running" style={{ width: "6px", height: "6px", background: "var(--accent-green)" }} />
              <span style={{ color: "var(--text-secondary)" }}>Database:</span>
              <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>Connected</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem" }}>
              <span className="status-dot running" style={{ width: "6px", height: "6px", background: "var(--accent-green)" }} />
              <span style={{ color: "var(--text-secondary)" }}>Redis Broker:</span>
              <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>Online</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Section Grid: Left (Campaign Input & Recent Campaigns) | Right (Quick Links / Insights) */}
      <div style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr", gap: "1.5rem" }}>
        
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          
          {/* Quick AI Campaign Creator */}
          <div className="card" style={{ padding: "1.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  background: "rgba(255, 79, 0, 0.08)",
                  border: "1px solid rgba(255, 79, 0, 0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Sparkles size={16} color="var(--accent-primary)" />
              </div>
              <div>
                <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>Quick Campaign Launch</h3>
                <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                  Describe your target segment to instantly spin up the orchestration flow.
                </p>
              </div>
            </div>

            <form action="/campaigns/new" method="GET" style={{ display: "flex", gap: "0.75rem" }}>
              <input
                type="text"
                name="goal"
                placeholder="e.g. Re-engage gold tier members in Delhi recommending apparel..."
                required
                className="input"
                style={{ flex: 1, fontSize: "0.875rem", height: "42px", padding: "0 0.875rem" }}
              />
              <button type="submit" className="btn btn-primary" style={{ gap: "0.5rem", height: "42px" }}>
                <span>Orchestrate</span>
                <ArrowRight size={14} />
              </button>
            </form>
          </div>

          {/* Recent Campaigns Table */}
          <div className="card" style={{ padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Megaphone size={18} color="var(--accent-primary)" />
                Recent Campaigns
              </h3>
              <Link href="/campaigns" style={{ fontSize: "0.75rem", color: "var(--accent-primary)", textDecoration: "none", display: "flex", alignItems: "center", gap: "4px", fontWeight: 600 }}>
                View All <ArrowRight size={12} />
              </Link>
            </div>

            {recentCampaigns.length === 0 ? (
              <div style={{ textAlign: "center", padding: "3rem 1rem", border: "1px dashed var(--border)", borderRadius: "10px" }}>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>No campaigns created yet.</p>
                <Link href="/campaigns/new" className="btn btn-ghost btn-sm" style={{ marginTop: "1rem" }}>
                  Create one now
                </Link>
              </div>
            ) : (
              <div style={{ borderRadius: "8px", overflow: "hidden", border: "1px solid var(--border)" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Campaign Name</th>
                      <th>Channel</th>
                      <th>Audience</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentCampaigns.map((c) => {
                      let badgeCls = "badge-muted";
                      if (c.status === "RUNNING") badgeCls = "badge-cyan";
                      if (c.status === "COMPLETED") badgeCls = "badge-green";
                      if (c.status === "FAILED") badgeCls = "badge-red";
                      if (c.status === "REVIEW") badgeCls = "badge-amber";

                      return (
                        <tr key={c.id}>
                          <td>
                            <Link href={`/campaigns/${c.id}`} style={{ color: "var(--text-primary)", fontWeight: 600, textDecoration: "none" }}>
                              {c.name.length > 35 ? `${c.name.slice(0, 35)}...` : c.name}
                            </Link>
                          </td>
                          <td>
                            <span style={{ textTransform: "capitalize", fontSize: "0.75rem" }}>
                              {c.channel === "whatsapp" ? "💬 WhatsApp" : c.channel === "email" ? "📧 Email" : c.channel === "sms" ? "📱 SMS" : "🔔 RCS"}
                            </span>
                          </td>
                          <td>{c.audienceCount.toLocaleString()}</td>
                          <td>
                            <span className={`badge ${badgeCls}`} style={{ display: "inline-flex", fontSize: "0.6875rem", padding: "2px 8px" }}>
                              {c.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right column: System Quick Stats & Brand Memory */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          
          {/* Brand Guidelines Widget */}
          <div className="card" style={{ padding: "1.5rem" }}>
            <h3 style={{ fontSize: "0.9375rem", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Database size={16} color="var(--accent-secondary)" />
              Nike Brand Memory
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
              <div style={{ padding: "0.75rem", borderRadius: "8px", background: "rgba(255, 255, 255, 0.01)", border: "1px solid var(--border)" }}>
                <strong style={{ color: "var(--text-primary)" }}>Tone:</strong> Bold, motivational, energetic ("Just Do It" voice)
              </div>
              <div style={{ padding: "0.75rem", borderRadius: "8px", background: "rgba(255, 255, 255, 0.01)", border: "1px solid var(--border)" }}>
                <strong style={{ color: "var(--text-primary)" }}>Exclusions:</strong> No competitors, no generic discount codes, no price-first tags.
              </div>
              <div style={{ padding: "0.75rem", borderRadius: "8px", background: "rgba(255, 255, 255, 0.01)", border: "1px solid var(--border)" }}>
                <strong style={{ color: "var(--text-primary)" }}>Preferred Channels:</strong> WhatsApp (high-priority), Email, SMS, RCS.
              </div>
            </div>
            <Link href="/settings" className="btn btn-ghost btn-sm" style={{ marginTop: "1rem", width: "100%", justifyContent: "center" }}>
              Edit Guidelines
            </Link>
          </div>

          {/* Campaign Conversion Insights */}
          <div className="card" style={{ padding: "1.5rem" }}>
            <h3 style={{ fontSize: "0.9375rem", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <BarChart3 size={16} color="var(--accent-cyan)" />
              Performance Summary
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem", fontSize: "0.8125rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>
                <span style={{ color: "var(--text-secondary)" }}>Active Campaigns</span>
                <span style={{ color: "var(--accent-cyan)", fontWeight: 700 }}>{activeCampaigns.length}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>
                <span style={{ color: "var(--text-secondary)" }}>Completed Runs</span>
                <span style={{ color: "var(--accent-green)", fontWeight: 700 }}>{completedCampaigns.length}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>
                <span style={{ color: "var(--text-secondary)" }}>Success Rate</span>
                <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>
                  {campaigns.length > 0
                    ? `${Math.round((completedCampaigns.length / campaigns.length) * 100)}%`
                    : "100%"}
                </span>
              </div>
            </div>
            <Link href="/analytics" className="btn btn-ghost btn-sm" style={{ marginTop: "1rem", width: "100%", justifyContent: "center" }}>
              Detailed Analytics
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
