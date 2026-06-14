"use client";

import { useState } from "react";
import { MessageSquare, RefreshCw, Edit2, Check, X } from "lucide-react";
import type { ContentAgentOutput } from "@/types";

interface CheckpointContentProps {
  runId: string;
  data: ContentAgentOutput & { channelHint?: string };
  onApprove: () => void;
  onCancel: () => void;
}

export function CheckpointContent({
  runId,
  data,
  onApprove,
  onCancel,
}: CheckpointContentProps) {
  const [editedMessage, setEditedMessage] = useState(data.body);
  const [editedSubject, setEditedSubject] = useState(data.subject ?? "");
  const [regenerationFeedback, setRegenerationFeedback] = useState("");
  const [mode, setMode] = useState<"view" | "edit" | "regenerate">("view");
  const [isLoading, setIsLoading] = useState(false);

  const channel = data.channelHint ?? "email";
  const isWhatsApp = channel === "whatsapp";
  const isEmail = channel === "email";
  const charCount = (editedMessage + (editedSubject ? ` ${editedSubject}` : "") + data.cta).length;
  const overLimit = channel === "sms" && charCount > 160;

  async function handleApprove() {
    setIsLoading(true);
    const hasEdits = editedMessage !== data.body || editedSubject !== (data.subject ?? "");
    await fetch(`/api/orchestrator/${runId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkpoint: "CONTENT",
        action: hasEdits ? "edit" : "approve",
        ...(hasEdits ? { editedMessage, editedSubject } : {}),
      }),
    });
    onApprove();
  }

  async function handleRegenerate() {
    if (!regenerationFeedback.trim()) return;
    setIsLoading(true);
    await fetch(`/api/orchestrator/${runId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkpoint: "CONTENT", action: "regenerate", regenerationFeedback }),
    });
    onApprove(); // SSE will pick up the re-run
  }

  async function handleCancel() {
    await fetch(`/api/orchestrator/${runId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkpoint: "CONTENT", action: "cancel" }),
    });
    onCancel();
  }

  return (
    <div className="checkpoint-card animate-fade-in-up" style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: "18px" }}>
      {/* Header */}
      <div className="checkpoint-header">
        <div
          style={{
            width: "38px",
            height: "38px",
            borderRadius: "10px",
            background: "rgba(139,92,246,0.08)",
            border: "1px solid rgba(139,92,246,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <MessageSquare size={18} color="var(--accent-secondary)" />
        </div>
        <div>
          <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "2px" }}>
            Checkpoint 3 of 4
          </div>
          <h3 style={{ fontSize: "1.125rem", fontWeight: 800 }}>Campaign Message</h3>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span className="badge badge-muted">{channel.toUpperCase()}</span>
          <span className="badge badge-violet">Review Required</span>
        </div>
      </div>

      {/* Message preview */}
      <div style={{ marginBottom: "1.75rem" }}>
        {isWhatsApp && (
          <div className="whatsapp-bg">
            <div className="whatsapp-msg">
              {isEmail && editedSubject && (
                <div style={{ fontWeight: 750, marginBottom: "0.5rem", color: "#e9edef", fontSize: "0.9375rem" }}>{editedSubject}</div>
              )}
              <div style={{ fontWeight: 750, marginBottom: "0.35rem", color: "#e9edef", fontSize: "0.9375rem" }}>{data.headline}</div>
              <div style={{ color: "#d1d7db", fontSize: "0.875rem", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{editedMessage}</div>
              <div style={{ marginTop: "0.75rem", color: "#53bdeb", fontWeight: 700, fontSize: "0.8125rem", display: "flex", alignItems: "center", gap: "0.25rem", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "0.5rem" }}>
                <span>🔗</span>
                <span>{data.cta}</span>
              </div>
            </div>
          </div>
        )}

        {isEmail && (
          <div className="email-preview">
            {editedSubject && (
              <div style={{ fontWeight: 800, fontSize: "1rem", color: "#0f172a", marginBottom: "0.875rem", paddingBottom: "0.875rem", borderBottom: "1px solid #e2e8f0" }}>
                <span style={{ color: "#64748b", fontWeight: 600, fontSize: "0.8125rem", marginRight: "0.5rem" }}>Subject:</span>
                {editedSubject}
              </div>
            )}
            <div style={{ fontWeight: 800, fontSize: "1.125rem", color: "#0f172a", marginBottom: "0.75rem" }}>{data.headline}</div>
            <div style={{ lineHeight: 1.7, color: "#334155", fontSize: "0.9375rem", whiteSpace: "pre-wrap" }}>{editedMessage}</div>
            <div style={{ marginTop: "1.5rem" }}>
              <span style={{ display: "inline-block", padding: "0.625rem 1.75rem", background: "var(--accent-primary)", color: "white", borderRadius: "8px", fontWeight: 700, fontSize: "0.875rem", boxShadow: "0 4px 12px rgba(255, 79, 0, 0.2)" }}>
                {data.cta}
              </span>
            </div>
          </div>
        )}

        {!isWhatsApp && !isEmail && (
          <div style={{ background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "10px", padding: "1.25rem", fontFamily: "monospace", fontSize: "0.875rem", color: "var(--text-primary)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {editedMessage}
          </div>
        )}
      </div>

      {/* Edit mode */}
      {mode === "edit" && (
        <div style={{ marginBottom: "1.75rem", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          {isEmail && (
            <input
              className="input"
              value={editedSubject}
              onChange={(e) => setEditedSubject(e.target.value)}
              placeholder="Email subject line..."
            />
          )}
          <textarea
            className="input"
            value={editedMessage}
            onChange={(e) => setEditedMessage(e.target.value)}
            rows={5}
            placeholder="Edit message body..."
            style={{ borderColor: overLimit ? "var(--accent-red)" : undefined }}
          />
          {channel === "sms" && (
            <div style={{ fontSize: "0.75rem", color: overLimit ? "var(--accent-red)" : "var(--text-muted)", textAlign: "right" }}>
              {charCount}/160 characters{overLimit ? " — exceeds SMS limit!" : ""}
            </div>
          )}
        </div>
      )}

      {/* Regenerate mode */}
      {mode === "regenerate" && (
        <div style={{ marginBottom: "1.75rem" }}>
          <div style={{ fontSize: "0.725rem", fontWeight: 700, color: "var(--accent-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>
            Instruction for AI (what to change?)
          </div>
          <textarea
            className="input"
            value={regenerationFeedback}
            onChange={(e) => setRegenerationFeedback(e.target.value)}
            rows={3}
            placeholder="e.g. Make it sound more motivational, focus on the weekend sale, avoid technical jargon..."
            autoFocus
          />
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button onClick={handleCancel} className="btn btn-danger btn-sm">
          <X size={14} /> Cancel Run
        </button>

        {mode === "view" && (
          <>
            <button onClick={() => setMode("regenerate")} className="btn btn-ghost btn-sm">
              <RefreshCw size={14} /> Regenerate
            </button>
            <button onClick={() => setMode("edit")} className="btn btn-ghost btn-sm">
              <Edit2 size={14} /> Edit Text
            </button>
            <button onClick={handleApprove} className="btn btn-primary" disabled={isLoading}>
              <Check size={16} strokeWidth={2.5} /> Approve Message
            </button>
          </>
        )}

        {mode === "edit" && (
          <>
            <button onClick={() => setMode("view")} className="btn btn-ghost btn-sm">Cancel Edit</button>
            <button onClick={handleApprove} className="btn btn-primary" disabled={isLoading || overLimit}>
              <Check size={16} strokeWidth={2.5} /> Save & Approve
            </button>
          </>
        )}

        {mode === "regenerate" && (
          <>
            <button onClick={() => setMode("view")} className="btn btn-ghost btn-sm">Cancel</button>
            <button onClick={handleRegenerate} className="btn btn-ai" disabled={isLoading || !regenerationFeedback.trim()}>
              <RefreshCw size={14} /> Re-draft with AI
            </button>
          </>
        )}
      </div>
    </div>
  );
}
