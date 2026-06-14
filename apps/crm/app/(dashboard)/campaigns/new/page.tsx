"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Zap, ArrowLeft, Lightbulb } from "lucide-react";
import Link from "next/link";
import { ThinkingPanel } from "@/components/campaigns/thinking-panel";
import { CheckpointSegment } from "@/components/campaigns/checkpoint-segment";
import { CheckpointProduct } from "@/components/campaigns/checkpoint-product";
import { CheckpointContent } from "@/components/campaigns/checkpoint-content";
import { CheckpointLaunch } from "@/components/campaigns/checkpoint-launch";
import type {
  OrchestratorStep,
  SegmentAgentOutput,
  ProductAgentOutput,
  ContentAgentOutput,
  ChannelAgentOutput,
  ExecutionPlan,
} from "@/types";

// ── State machine ─────────────────────────────────────────────────────────────

type UIStage =
  | "idle"
  | "running"
  | "awaiting_segment"
  | "awaiting_product"
  | "awaiting_content"
  | "awaiting_launch"
  | "completed"
  | "failed"
  | "cancelled";

// ── Example prompts ───────────────────────────────────────────────────────────

const EXAMPLES = [
  "Bring back dormant runners who haven't purchased in 60 days",
  "Re-engage gold & elite tier customers who bought basketball shoes",
  "Target Mumbai customers who bought lifestyle shoes in the last 90 days",
  "Win back customers who spent ₹20,000+ total but went quiet in 30 days",
];

export default function NewCampaignPage() {
  const router = useRouter();
  const [goal, setGoal] = useState("");
  const [stage, setStage] = useState<UIStage>("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [steps, setSteps] = useState<OrchestratorStep[]>([]);
  const [segmentResult, setSegmentResult] = useState<SegmentAgentOutput | null>(null);
  const [productResult, setProductResult] = useState<ProductAgentOutput | null>(null);
  const [contentResult, setContentResult] = useState<ContentAgentOutput | null>(null);
  const [channelResult, setChannelResult] = useState<ChannelAgentOutput | null>(null);
  const [executionPlan, setExecutionPlan] = useState<ExecutionPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  // Start the campaign orchestration
  async function handleStart() {
    if (!goal.trim()) return;
    setStage("running");
    setError(null);
    setSteps([]);

    const res = await fetch("/api/orchestrator/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal }),
    });

    if (!res.ok) {
      setStage("failed");
      setError("Failed to start orchestration");
      return;
    }

    const { runId: id } = await res.json() as { runId: string };
    setRunId(id);

    // Open SSE stream
    const es = new EventSource(`/api/orchestrator/${id}/stream`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      const data = JSON.parse(event.data) as {
        type: "step" | "status_change";
        step?: OrchestratorStep;
        status?: string;
        runData?: {
          segmentResult?: unknown;
          productResult?: unknown;
          contentResult?: unknown;
          channelResult?: unknown;
          executionPlan?: unknown;
          campaignId?: string;
          error?: string;
        };
      };

      if (data.type === "step" && data.step) {
        setSteps((prev) => [...prev, data.step!]);
      }

      if (data.type === "status_change" && data.status) {
        const runData = data.runData ?? {};
        handleStatusChange(data.status, runData);
        if (runData.error) setError(runData.error);
      }
    };

    // onerror fires when the stream closes (including on FAILED terminal state).
    // Fetch the run record to surface the error message to the user.
    es.onerror = () => {
      es.close();
      fetch(`/api/orchestrator/${id}`)
        .then((r) => r.json())
        .then((r: { data?: { status?: string; error?: string } }) => {
          if (r.data?.status === "FAILED") {
            setStage("failed");
            setError(r.data.error ?? "Orchestration failed — check server logs for details.");
          }
        })
        .catch(() => {
          // If we can't reach the server at all, show a generic error
          setStage("failed");
          setError("Connection to server lost. Check that the dev server is running.");
        });
    };
  }

  function handleStatusChange(
    status: string,
    runData: {
      segmentResult?: unknown;
      productResult?: unknown;
      contentResult?: unknown;
      channelResult?: unknown;
      executionPlan?: unknown;
      campaignId?: string;
    }
  ) {
    switch (status) {
      case "AWAITING_SEGMENT_APPROVAL":
        setSegmentResult(runData.segmentResult as SegmentAgentOutput);
        setStage("awaiting_segment");
        break;
      case "AWAITING_PRODUCT_APPROVAL":
        setProductResult(runData.productResult as ProductAgentOutput);
        setStage("awaiting_product");
        break;
      case "AWAITING_CONTENT_APPROVAL":
        setContentResult(runData.contentResult as ContentAgentOutput);
        setStage("awaiting_content");
        break;
      case "AWAITING_LAUNCH_APPROVAL":
        setChannelResult(runData.channelResult as ChannelAgentOutput);
        setExecutionPlan(runData.executionPlan as ExecutionPlan);
        setStage("awaiting_launch");
        break;
      case "RUNNING":
        setStage("running");
        break;
      case "COMPLETED":
        setStage("completed");
        eventSourceRef.current?.close();
        if (runData.campaignId) {
          setTimeout(() => router.push(`/campaigns/${runData.campaignId}`), 1500);
        }
        break;
      case "FAILED":
        setStage("failed");
        eventSourceRef.current?.close();
        break;
      case "CANCELLED":
        setStage("cancelled");
        eventSourceRef.current?.close();
        break;
    }
  }

  function handleApprove() {
    setStage("running");
  }

  function handleCancel() {
    eventSourceRef.current?.close();
    router.push("/campaigns");
  }

  const isRunning = stage === "running";

  // Stage labels for the progress indicator
  const STAGES = [
    { key: "awaiting_segment", label: "Audience", num: 1 },
    { key: "awaiting_product", label: "Products", num: 2 },
    { key: "awaiting_content", label: "Message", num: 3 },
    { key: "awaiting_launch", label: "Launch", num: 4 },
  ];
  const currentStageIdx = STAGES.findIndex((s) => s.key === stage);

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "1rem 0" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "2.5rem" }}>
        <Link href="/campaigns" className="btn btn-ghost btn-sm">
          <ArrowLeft size={14} /> Back
        </Link>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800 }}>New Campaign</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Describe your goal — AI will orchestrate the rest
          </p>
        </div>
      </div>

      {/* Goal input — show when idle */}
      {stage === "idle" && (
        <div className="card" style={{ marginBottom: "1.5rem", padding: "2rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", marginBottom: "1.5rem" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "12px",
                background: "rgba(139, 92, 246, 0.08)",
                border: "1px solid rgba(139, 92, 246, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Zap size={20} color="var(--accent-secondary)" />
            </div>
            <div>
              <h3 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>Campaign Goal</h3>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "2px", margin: 0 }}>
                Describe your target segment or campaign objective
              </p>
            </div>
          </div>

          <textarea
            id="campaign-goal-input"
            className="input"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={4}
            placeholder="e.g. Re-engage Nike elite customers who bought running shoes but haven't ordered in 45 days..."
            style={{ fontSize: "0.9375rem", padding: "1rem" }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && goal.trim()) {
                void handleStart();
              }
            }}
          />

          {/* Example prompts */}
          <div style={{ marginTop: "1.5rem" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <Lightbulb size={12} color="var(--accent-amber)" />
              Try a sample prompt:
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setGoal(ex)}
                  style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid var(--border)",
                    textAlign: "left",
                    padding: "0.75rem 1rem",
                    borderRadius: "10px",
                    color: "var(--text-secondary)",
                    fontSize: "0.8125rem",
                    cursor: "pointer",
                    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                    lineHeight: 1.4,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255, 79, 0, 0.04)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255, 79, 0, 0.2)";
                    (e.currentTarget as HTMLButtonElement).style.color = "#ff6d24";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255, 255, 255, 0.02)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
                    (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
                  }}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: "2rem", display: "flex", justifyContent: "flex-end" }}>
            <button
              id="start-campaign-btn"
              onClick={() => void handleStart()}
              className="btn btn-ai btn-lg"
              disabled={!goal.trim()}
            >
              <Zap size={16} strokeWidth={2.5} />
              Start Orchestration
            </button>
          </div>
        </div>
      )}

      {/* Progress indicator */}
      {stage !== "idle" && stage !== "cancelled" && (
        <div className="card" style={{ marginBottom: "1.5rem", padding: "1.25rem 1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem" }}>
            <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", fontStyle: "italic", flex: 1, margin: 0 }}>
              &ldquo;{goal.slice(0, 100)}{goal.length > 100 ? "..." : ""}&rdquo;
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            {STAGES.map((s, i) => {
              const isDone = currentStageIdx > i || stage === "completed";
              const isCurrent = currentStageIdx === i;

              return (
                <div key={s.key} style={{ flex: 1, display: "flex", alignItems: "center" }}>
                  <div
                    style={{
                      flex: 1,
                      textAlign: "center",
                      padding: "0.625rem 0.5rem",
                      borderRadius: "10px",
                      background: isDone
                        ? "rgba(16, 185, 129, 0.05)"
                        : isCurrent
                        ? "rgba(139, 92, 246, 0.06)"
                        : "transparent",
                      border: isCurrent
                        ? "1px solid rgba(139, 92, 246, 0.2)"
                        : isDone
                        ? "1px solid rgba(16, 185, 129, 0.15)"
                        : "1px solid transparent",
                      transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 800,
                        color: isDone
                          ? "var(--accent-green)"
                          : isCurrent
                          ? "var(--accent-secondary)"
                          : "var(--text-muted)",
                        marginBottom: "1px",
                      }}
                    >
                      {isDone ? "✓" : s.num}
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: isDone ? "var(--accent-green)" : isCurrent ? "var(--text-primary)" : "var(--text-muted)"
                      }}
                    >
                      {s.label}
                    </div>
                  </div>
                  {i < STAGES.length - 1 && (
                    <div
                      style={{
                        width: "16px",
                        height: "1px",
                        background: isDone ? "var(--accent-green)" : "var(--border)",
                        flexShrink: 0,
                        marginLeft: "0.25rem",
                        marginRight: "0.25rem"
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Thinking panel — shown immediately once orchestration starts */}
      {stage !== "idle" && stage !== "cancelled" && stage !== "completed" && (
        <div style={{ marginBottom: "1.5rem" }}>
          <ThinkingPanel steps={steps} isRunning={isRunning} />
        </div>
      )}

      {/* Checkpoints */}
      {stage === "awaiting_segment" && segmentResult && runId && (
        <CheckpointSegment
          runId={runId}
          data={segmentResult}
          onApprove={handleApprove}
          onCancel={handleCancel}
        />
      )}

      {stage === "awaiting_product" && productResult && runId && (
        <CheckpointProduct
          runId={runId}
          data={productResult}
          onApprove={handleApprove}
          onCancel={handleCancel}
        />
      )}

      {stage === "awaiting_content" && contentResult && runId && (
        <CheckpointContent
          runId={runId}
          data={contentResult}
          onApprove={handleApprove}
          onCancel={handleCancel}
        />
      )}

      {stage === "awaiting_launch" && executionPlan && channelResult && segmentResult && productResult && contentResult && runId && (
        <CheckpointLaunch
          runId={runId}
          executionPlan={executionPlan}
          segmentResult={segmentResult}
          productResult={productResult}
          contentResult={contentResult}
          channelResult={channelResult}
          onLaunch={(id) => router.push(`/campaigns/${id}`)}
          onCancel={handleCancel}
        />
      )}

      {/* Error state */}
      {error && (
        <div style={{ padding: "1.25rem", background: "rgba(244,63,94,0.06)", border: "1px solid rgba(244,63,94,0.2)", borderRadius: "12px", color: "var(--accent-red)", fontSize: "0.875rem", marginTop: "1rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span>❌</span>
          <span style={{ fontWeight: 500 }}>{error}</span>
        </div>
      )}

      {/* Completed state */}
      {stage === "completed" && (
        <div
          className="card"
          style={{ textAlign: "center", padding: "4rem 2rem", border: "1px solid rgba(16,185,129,0.25)", marginTop: "1rem", background: "rgba(16,185,129,0.02)" }}
        >
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🚀</div>
          <h2 style={{ color: "var(--accent-green)", marginBottom: "0.5rem", fontSize: "1.5rem", fontWeight: 800 }}>Campaign Launched!</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0 }}>Redirecting to campaign analytics...</p>
        </div>
      )}

      {/* Cancelled state */}
      {stage === "cancelled" && (
        <div className="card" style={{ textAlign: "center", padding: "4rem 2rem", marginTop: "1rem" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>⛔</div>
          <h2 style={{ fontSize: "1.25rem", marginBottom: "0.5rem", color: "var(--text-primary)" }}>Orchestration Cancelled</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>The campaign run was stopped.</p>
          <Link href="/campaigns" className="btn btn-ghost">
            Back to Campaigns
          </Link>
        </div>
      )}
    </div>
  );
}
