"use client";

import { useState } from "react";
import { Rocket, Check, X, Calendar } from "lucide-react";
import type { ExecutionPlan, SegmentAgentOutput, ProductAgentOutput, ContentAgentOutput, ChannelAgentOutput } from "@/types";

interface CheckpointLaunchProps {
  runId: string;
  executionPlan: ExecutionPlan;
  segmentResult: SegmentAgentOutput;
  productResult: ProductAgentOutput;
  contentResult: ContentAgentOutput;
  channelResult: ChannelAgentOutput;
  onLaunch: (campaignId: string) => void;
  onCancel: () => void;
}

const CHANNEL_LABELS = {
  whatsapp: "💬 WhatsApp",
  email: "📧 Email",
  sms: "📱 SMS",
  rcs: "🔔 RCS",
};

export function CheckpointLaunch({
  runId,
  executionPlan,
  segmentResult,
  channelResult,
  onLaunch,
  onCancel,
}: CheckpointLaunchProps) {
  const [channelOverride, setChannelOverride] = useState<string | null>(null);
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const finalChannel = channelOverride ?? executionPlan.recommendedChannel;

  async function handleLaunch() {
    setIsLoading(true);
    const body: Record<string, unknown> = {
      checkpoint: "LAUNCH",
      action: "launch",
      ...(channelOverride ? { channelOverride } : {}),
      ...(scheduleMode === "later" && scheduledAt ? { scheduledAt } : {}),
    };
    const res = await fetch(`/api/orchestrator/${runId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json() as { status: string };
    if (data.status === "launched") {
      onLaunch(runId); // navigate to campaign
    }
  }

  async function handleCancel() {
    await fetch(`/api/orchestrator/${runId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkpoint: "LAUNCH", action: "cancel" }),
    });
    onCancel();
  }

  return (
    <div className="checkpoint-card animate-fade-in-up" style={{ background: "var(--bg-card)", border: "1px solid rgba(255, 79, 0, 0.25)", borderRadius: "18px" }}>
      {/* Header */}
      <div className="checkpoint-header">
        <div
          style={{
            width: "38px",
            height: "38px",
            borderRadius: "10px",
            background: "rgba(255,79,0,0.08)",
            border: "1px solid rgba(255,79,0,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Rocket size={18} color="var(--accent-primary)" />
        </div>
        <div>
          <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "2px" }}>
            Final Review — Checkpoint 4 of 4
          </div>
          <h3 style={{ fontSize: "1.125rem", fontWeight: 800 }}>Ready to Launch</h3>
        </div>
        <span className="badge badge-orange animate-glow-pulse" style={{ marginLeft: "auto" }}>
          Final Approval
        </span>
      </div>

      {/* Summary grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="metric-card" style={{ padding: "1.25rem" }}>
          <div className="metric-label" style={{ marginBottom: "0.25rem" }}>Target Recipients</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 850, color: "var(--accent-cyan)", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
            {segmentResult.count.toLocaleString()}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>Active CRM members</div>
        </div>

        <div className="metric-card" style={{ padding: "1.25rem" }}>
          <div className="metric-label" style={{ marginBottom: "0.25rem" }}>Recommended Channel</div>
          <div style={{ fontSize: "1.125rem", fontWeight: 800, color: "var(--text-primary)", marginBottom: "0.25rem" }}>
            {CHANNEL_LABELS[executionPlan.recommendedChannel as keyof typeof CHANNEL_LABELS]}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--accent-green)", fontWeight: 600 }}>
            {Math.round(channelResult.confidenceScore * 100)}% confidence rate
          </div>
        </div>
      </div>

      {/* Channel reasoning */}
      <div style={{ padding: "1rem", background: "rgba(139, 92, 246, 0.04)", border: "1px solid rgba(139, 92, 246, 0.12)", borderRadius: "10px", marginBottom: "1.5rem" }}>
        <div style={{ fontSize: "0.725rem", fontWeight: 700, color: "var(--accent-secondary)", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          AI Channel Reasoning
        </div>
        <p style={{ fontSize: "0.875rem", color: "var(--text-primary)", lineHeight: 1.6, margin: 0 }}>
          {channelResult.reasoning}
        </p>
      </div>

      {/* Channel override */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ fontSize: "0.725rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
          Select Delivery Channel
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {(["whatsapp", "email", "sms", "rcs"] as const).map((ch) => {
            const active = finalChannel === ch;
            return (
              <button
                key={ch}
                onClick={() => setChannelOverride(channelOverride === ch ? null : ch)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.5rem 1.125rem",
                  borderRadius: "9999px",
                  border: active ? "1px solid var(--accent-secondary)" : "1px solid var(--border)",
                  background: active ? "rgba(139, 92, 246, 0.08)" : "rgba(255,255,255,0.01)",
                  color: active ? "#c084fc" : "var(--text-secondary)",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-strong)";
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255, 255, 255, 0.04)";
                    (e.currentTarget as HTMLButtonElement).style.color = "#ffffff";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.01)";
                    (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
                  }
                }}
              >
                {CHANNEL_LABELS[ch]}
                {ch === executionPlan.recommendedChannel && " (Best)"}
              </button>
            );
          })}
        </div>
      </div>

      {/* Schedule */}
      <div style={{ marginBottom: "2.25rem" }}>
        <div style={{ fontSize: "0.725rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
          Delivery Schedule
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={() => setScheduleMode("now")}
            className={`btn btn-sm ${scheduleMode === "now" ? "btn-primary" : "btn-ghost"}`}
          >
            Send Immediately
          </button>
          <button
            onClick={() => setScheduleMode("later")}
            className={`btn btn-sm ${scheduleMode === "later" ? "btn-primary" : "btn-ghost"}`}
          >
            <Calendar size={12} />
            Schedule Later
          </button>
        </div>
        {scheduleMode === "later" && (
          <input
            type="datetime-local"
            className="input"
            style={{ marginTop: "0.75rem", maxWidth: "280px" }}
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            min={new Date().toISOString().slice(0, 16)}
          />
        )}
      </div>

      {/* Launch actions */}
      <div style={{ display: "flex", gap: "0.75rem", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={handleCancel} className="btn btn-danger btn-sm">
          <X size={14} />
          Cancel Run
        </button>

        <button
          id="launch-campaign-btn"
          onClick={handleLaunch}
          className="btn btn-primary"
          disabled={isLoading || (scheduleMode === "later" && !scheduledAt)}
          style={{ gap: "0.625rem", padding: "0.75rem 1.75rem" }}
        >
          <Rocket size={16} strokeWidth={2.5} />
          {isLoading ? "Launching..." : `Launch to ${(segmentResult.count ?? 0).toLocaleString()} customers`}
        </button>
      </div>
    </div>
  );
}
