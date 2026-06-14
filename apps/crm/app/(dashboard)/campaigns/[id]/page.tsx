import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageSquare, ShieldAlert } from "lucide-react";
import { db } from "@/lib/db/client";
import { getAnalyticsSnapshot } from "@/lib/db/queries/analytics";
import { LiveAnalytics } from "@/components/analytics/live-analytics";

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const campaign = await db.campaign.findUnique({ where: { id }, select: { name: true } });
  return { title: campaign?.name ?? "Campaign Detail" };
}

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign) notFound();

  const analytics = await getAnalyticsSnapshot(id);

  const CHANNEL_ICONS: Record<string, string> = {
    whatsapp: "💬",
    email: "📧",
    sms: "📱",
    rcs: "🔔",
  };

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "1rem 0" }}>
      {/* Header Back Button */}
      <div style={{ marginBottom: "1.5rem" }}>
        <Link href="/campaigns" className="btn btn-ghost btn-sm">
          <ArrowLeft size={14} /> Back to Campaigns
        </Link>
      </div>

      <div style={{ marginBottom: "2.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
          <span style={{ fontSize: "1.875rem", lineHeight: 1 }}>{CHANNEL_ICONS[campaign.channel] ?? "📢"}</span>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800 }}>{campaign.name}</h1>
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem", lineHeight: 1.6, margin: 0 }}>{campaign.goal}</p>
      </div>

      {/* Details Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
        <div className="metric-card">
          <div className="metric-label">Channel</div>
          <div style={{ fontWeight: 700, fontSize: "1.125rem", color: "var(--text-primary)", marginTop: "0.25rem" }}>
            {campaign.channel.toUpperCase()}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Audience Size</div>
          <div style={{ fontWeight: 850, fontSize: "1.5rem", color: "var(--accent-cyan)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
            {campaign.audienceCount.toLocaleString()}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Created On</div>
          <div style={{ fontWeight: 700, fontSize: "1.125rem", color: "var(--text-primary)", marginTop: "0.25rem" }}>
            {new Date(campaign.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </div>
        </div>
      </div>

      {/* Message template box */}
      <div className="card" style={{ marginBottom: "2rem" }}>
        <h3 style={{ marginBottom: "1.25rem", fontSize: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <MessageSquare size={16} color="var(--accent-primary)" />
          Campaign Copy
        </h3>
        {campaign.subject && (
          <div style={{ marginBottom: "1rem", paddingBottom: "0.75rem", borderBottom: "1px solid var(--border)" }}>
            <div className="metric-label" style={{ marginBottom: "0.25rem" }}>Subject Line</div>
            <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.9375rem" }}>{campaign.subject}</div>
          </div>
        )}
        <div
          style={{
            background: "var(--bg-input)",
            borderRadius: "10px",
            padding: "1.25rem",
            color: "var(--text-primary)",
            lineHeight: 1.7,
            fontSize: "0.9375rem",
            border: "1px solid var(--border)",
            fontFamily: campaign.channel === "email" ? "inherit" : "monospace",
            whiteSpace: "pre-wrap",
          }}
        >
          {campaign.messageTemplate}
        </div>
      </div>

      {/* Live analytics section */}
      <div className="card" style={{ padding: "1.5rem 1.75rem" }}>
        <LiveAnalytics campaignId={id} initialStats={analytics} />
      </div>
    </div>
  );
}
