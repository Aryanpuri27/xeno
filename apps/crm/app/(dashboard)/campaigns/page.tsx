import type { Metadata } from "next";
import Link from "next/link";
import { getCampaignsWithStats } from "@/lib/db/queries/campaigns";
import { Plus, Megaphone, Clock, CheckCircle, XCircle, Loader } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Campaigns",
  description: "View and manage your Nike CRM campaigns",
};

const STATUS_CONFIG = {
  DRAFT:      { label: "Draft",     cls: "badge-muted",   icon: Clock },
  REVIEW:     { label: "Review",    cls: "badge-amber",   icon: Clock },
  RUNNING:    { label: "Running",   cls: "badge-cyan",    icon: Loader },
  COMPLETED:  { label: "Completed", cls: "badge-green",   icon: CheckCircle },
  FAILED:     { label: "Failed",    cls: "badge-red",     icon: XCircle },
  CANCELLED:  { label: "Cancelled", cls: "badge-muted",   icon: XCircle },
};

const CHANNEL_CONFIG = {
  whatsapp: { label: "WhatsApp", emoji: "💬" },
  email:    { label: "Email",    emoji: "📧" },
  sms:      { label: "SMS",      emoji: "📱" },
  rcs:      { label: "RCS",      emoji: "🔔" },
};

export default async function CampaignsPage() {
  const campaigns = await getCampaignsWithStats(50);

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "1rem 0" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2.5rem" }}>
        <div>
          <h1 style={{ marginBottom: "0.5rem" }}>
            <span className="text-gradient">Campaigns</span>
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
            Orchestrate AI-native campaigns with human-in-the-loop validation
          </p>
        </div>
        <Link href="/campaigns/new" className="btn btn-primary">
          <Plus size={16} strokeWidth={2.5} />
          New Campaign
        </Link>
      </div>

      {/* Empty state */}
      {campaigns.length === 0 && (
        <div
          className="card"
          style={{
            textAlign: "center",
            padding: "6rem 2rem",
            background: "rgba(13, 13, 17, 0.4)",
            border: "1px dashed var(--border-strong)",
            borderRadius: "20px",
            maxWidth: "640px",
            margin: "2rem auto 0",
          }}
        >
          <div style={{ fontSize: "3rem", marginBottom: "1.5rem" }}>🚀</div>
          <h2 style={{ marginBottom: "0.75rem", color: "var(--text-primary)", fontSize: "1.25rem", fontWeight: 700 }}>
            Launch your first campaign
          </h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "2rem", maxWidth: "420px", margin: "0 auto 2rem", fontSize: "0.875rem", lineHeight: 1.6 }}>
            Describe your campaign goals in plain English. The AI orchestrator will draft target segments, products, templates, and delivery channels.
          </p>
          <Link href="/campaigns/new" className="btn btn-primary btn-lg">
            <Plus size={18} strokeWidth={2.5} />
            Create Campaign
          </Link>
        </div>
      )}

      {/* Campaign list */}
      {campaigns.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          {campaigns.map((campaign) => {
            const status = STATUS_CONFIG[campaign.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.DRAFT;
            const channel = CHANNEL_CONFIG[campaign.channel as keyof typeof CHANNEL_CONFIG] ?? { label: campaign.channel, emoji: "📢" };
            const StatusIcon = status.icon;

            return (
              <Link
                key={campaign.id}
                href={`/campaigns/${campaign.id}`}
                style={{ textDecoration: "none" }}
              >
                <div
                  className="card"
                  style={{
                    cursor: "pointer",
                    padding: "1.25rem 1.5rem"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1.5rem" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                        <span style={{ fontSize: "1.125rem", lineHeight: 1 }}>{channel.emoji}</span>
                        <h3 className="truncate" style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                          {campaign.name}
                        </h3>
                        <span className={`badge ${status.cls}`} style={{ flexShrink: 0 }}>
                          <StatusIcon size={11} strokeWidth={2.5} className={campaign.status === "RUNNING" ? "spin" : ""} />
                          {status.label}
                        </span>
                      </div>
                      <p
                        className="truncate"
                        style={{ color: "var(--text-secondary)", fontSize: "0.875rem", maxWidth: "720px", margin: 0 }}
                      >
                        {campaign.goal}
                      </p>
                    </div>
                    
                    <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexShrink: 0 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "1.25rem", fontWeight: 850, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
                          {campaign.audienceCount.toLocaleString()}
                        </div>
                        <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                          Audience
                        </div>
                      </div>
                      <div style={{ borderLeft: "1px solid var(--border)", height: "28px" }} />
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary)" }}>
                          {new Date(campaign.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </div>
                        <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                          Created
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
