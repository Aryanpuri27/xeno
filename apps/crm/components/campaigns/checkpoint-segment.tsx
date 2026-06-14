"use client";

import { useState } from "react";
import { Users, AlertTriangle, Check, Edit2, X } from "lucide-react";
import type { SegmentAgentOutput } from "@/types";

interface CheckpointSegmentProps {
  runId: string;
  data: SegmentAgentOutput;
  onApprove: () => void;
  onCancel: () => void;
}

export function CheckpointSegment({
  runId,
  data,
  onApprove,
  onCancel,
}: CheckpointSegmentProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedDescription, setEditedDescription] = useState(data.description ?? "");
  const [isLoading, setIsLoading] = useState(false);

  async function handleApprove() {
    setIsLoading(true);
    await fetch(`/api/orchestrator/${runId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkpoint: "SEGMENT", action: "approve" }),
    });
    onApprove();
  }

  async function handleEdit() {
    setIsLoading(true);
    await fetch(`/api/orchestrator/${runId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkpoint: "SEGMENT", action: "edit", editedDescription }),
    });
    setIsEditing(false);
    onApprove(); // re-run will start and SSE will handle the update
  }

  async function handleCancel() {
    await fetch(`/api/orchestrator/${runId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkpoint: "SEGMENT", action: "cancel" }),
    });
    onCancel();
  }

  const hasWarning = data.count === 0;

  return (
    <div className="checkpoint-card animate-fade-in-up" style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: "18px" }}>
      {/* Header */}
      <div className="checkpoint-header">
        <div
          style={{
            width: "38px",
            height: "38px",
            borderRadius: "10px",
            background: hasWarning ? "rgba(245,158,11,0.08)" : "rgba(6,182,212,0.08)",
            border: hasWarning ? "1px solid rgba(245,158,11,0.2)" : "1px solid rgba(6,182,212,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {hasWarning
            ? <AlertTriangle size={18} color="var(--accent-amber)" />
            : <Users size={18} color="var(--accent-cyan)" />
          }
        </div>
        <div>
          <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "2px" }}>
            Checkpoint 1 of 4
          </div>
          <h3 style={{ fontSize: "1.125rem", fontWeight: 800 }}>Audience Segmentation</h3>
        </div>
        <span className="badge badge-cyan" style={{ marginLeft: "auto" }}>Review Required</span>
      </div>

      {/* Warning */}
      {hasWarning && (
        <div
          style={{
            padding: "1rem",
            background: "rgba(245,158,11,0.06)",
            border: "1px solid rgba(245,158,11,0.2)",
            borderRadius: "10px",
            marginBottom: "1.5rem",
            color: "var(--accent-amber)",
            fontSize: "0.875rem",
            fontWeight: 500,
          }}
        >
          ⚠️ {data.warning ?? "No customers found matching this segment description. Edit the description to broaden the criteria."}
        </div>
      )}

      {/* Stats */}
      {!hasWarning && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "1.75rem" }}>
          <div className="metric-card" style={{ padding: "1.125rem 1.25rem", textAlign: "center" }}>
            <div style={{ fontSize: "1.75rem", fontWeight: 850, color: "var(--accent-cyan)", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
              {data.count.toLocaleString()}
            </div>
            <div className="metric-label" style={{ marginTop: "0.25rem" }}>Audience Size</div>
          </div>
          <div className="metric-card" style={{ padding: "1.125rem 1.25rem", textAlign: "center" }}>
            <div style={{ fontSize: "1.75rem", fontWeight: 850, color: "var(--accent-primary)", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
              {data.estimatedReach.toLocaleString()}
            </div>
            <div className="metric-label" style={{ marginTop: "0.25rem" }}>Est. Reach</div>
          </div>
          <div className="metric-card" style={{ padding: "1.125rem 1.25rem", textAlign: "center" }}>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--accent-green)", letterSpacing: "-0.02em", lineHeight: 1.1, textTransform: "capitalize" }}>
              {data.inferredCategory ?? "—"}
            </div>
            <div className="metric-label" style={{ marginTop: "0.25rem" }}>Inferred Category</div>
          </div>
        </div>
      )}

      {/* Description */}
      {!isEditing && (
        <div style={{ marginBottom: "1.75rem" }}>
          <div style={{ fontSize: "0.725rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>
            Audience Description
          </div>
          <p style={{ color: "var(--text-primary)", fontSize: "0.9375rem", lineHeight: 1.6, margin: 0 }}>
            {data.description}
          </p>
        </div>
      )}

      {/* Edit mode */}
      {isEditing && (
        <div style={{ marginBottom: "1.75rem" }}>
          <div style={{ fontSize: "0.725rem", fontWeight: 700, color: "var(--accent-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>
            Refine Segment Query Description
          </div>
          <textarea
            className="input"
            value={editedDescription}
            onChange={(e) => setEditedDescription(e.target.value)}
            rows={3}
            placeholder="e.g. Running shoe buyers who haven't ordered in 60 days..."
            style={{ fontSize: "0.9375rem", padding: "0.875rem" }}
          />
        </div>
      )}

      {/* Sample customers table */}
      {data.sample.length > 0 && !isEditing && (
        <div style={{ marginBottom: "1.75rem" }}>
          <div style={{ fontSize: "0.725rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
            Sample Target Group ({Math.min(5, data.sample.length)} of {data.count.toLocaleString()})
          </div>
          <div style={{ borderRadius: "10px", overflow: "hidden", border: "1px solid var(--border)" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Last Order</th>
                </tr>
              </thead>
              <tbody>
                {data.sample.map((c) => (
                  <tr key={c.id}>
                    <td style={{ color: "var(--text-primary)", fontWeight: 600 }}>{c.name}</td>
                    <td>{c.email}</td>
                    <td>{c.lastOrderDate
                      ? new Date(c.lastOrderDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                      : "—"
                    }</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SQL Preview */}
      {!isEditing && (
        <details style={{ marginBottom: "2rem" }}>
          <summary style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", cursor: "pointer", userSelect: "none", fontWeight: 600 }}>
            Inspect query logic (SQL)
          </summary>
          <pre style={{ marginTop: "0.75rem", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "8px", padding: "1rem", fontSize: "0.8125rem", color: "var(--accent-cyan)", overflowX: "auto", lineHeight: 1.6, fontFamily: "monospace" }}>
            {data.sql}
          </pre>
        </details>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button onClick={handleCancel} className="btn btn-danger btn-sm">
          <X size={14} />
          Cancel Run
        </button>
        {!isEditing ? (
          <button onClick={() => setIsEditing(true)} className="btn btn-ghost btn-sm">
            <Edit2 size={14} />
            Refine Segment
          </button>
        ) : (
          <button onClick={() => setIsEditing(false)} className="btn btn-ghost btn-sm">
            Cancel
          </button>
        )}
        {isEditing ? (
          <button
            onClick={handleEdit}
            className="btn btn-ai"
            disabled={isLoading || !editedDescription.trim()}
          >
            Re-run Segment Agent
          </button>
        ) : (
          <button
            onClick={handleApprove}
            className="btn btn-primary"
            disabled={isLoading || hasWarning}
          >
            <Check size={16} strokeWidth={2.5} />
            Approve Audience
          </button>
        )}
      </div>
    </div>
  );
}
