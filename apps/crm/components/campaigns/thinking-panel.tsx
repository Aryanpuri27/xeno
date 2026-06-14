"use client";

import { useEffect, useRef } from "react";
import type { OrchestratorStep } from "@/types";

interface ThinkingPanelProps {
  steps: OrchestratorStep[];
  isRunning: boolean;
}

const STEP_ICONS: Record<string, string> = {
  thinking:    "🧠",
  checkpoint:  "✅",
  tool_call:   "⚡",
  tool_result: "📊",
  error:       "❌",
};

export function ThinkingPanel({ steps, isRunning }: ThinkingPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as new steps arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [steps.length]);

  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid rgba(139, 92, 246, 0.12)",
        borderRadius: "14px",
        padding: "1.5rem",
        maxHeight: "400px",
        overflowY: "auto",
        boxShadow: "0 8px 30px rgba(0, 0, 0, 0.35)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "1.25rem" }}>
        <div
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: isRunning ? "var(--accent-secondary)" : "var(--accent-green)",
            animation: isRunning ? "pulse-dot 1.5s infinite" : "none",
          }}
        />
        <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--accent-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          AI Thinking Log
        </span>
      </div>

      {steps.length === 0 && (
        <div style={{ color: "var(--text-muted)", fontSize: "0.8125rem", fontStyle: "italic", padding: "0.5rem" }}>
          Initializing orchestrator session...
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
        {steps.map((step, i) => (
          <div
            key={i}
            className="animate-fade-in-up"
            style={{
              display: "flex",
              gap: "0.75rem",
              padding: "0.625rem 0.875rem",
              borderRadius: "10px",
              border: "1px solid var(--border)",
              background: step.type === "checkpoint"
                ? "rgba(16, 185, 129, 0.04)"
                : step.type === "error"
                ? "rgba(244, 63, 94, 0.04)"
                : "rgba(255, 255, 255, 0.01)",
              animationDelay: `${i * 0.04}s`,
              animationFillMode: "both",
            }}
          >
            <span style={{ fontSize: "0.9375rem", flexShrink: 0, lineHeight: 1 }}>
              {STEP_ICONS[step.type] ?? "💬"}
            </span>
            <span
              style={{
                fontSize: "0.8125rem",
                color: step.type === "checkpoint"
                  ? "var(--accent-green)"
                  : step.type === "error"
                  ? "var(--accent-red)"
                  : "var(--text-secondary)",
                lineHeight: 1.5,
                fontWeight: step.type === "checkpoint" ? 600 : 500,
              }}
            >
              {step.message ?? step.checkpoint ?? "Processing..."}
            </span>
            <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginLeft: "auto", flexShrink: 0, alignSelf: "center", fontWeight: 500 }}>
              {new Date(step.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}

        {isRunning && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.875rem" }}>
            <div style={{ display: "flex", gap: "4px" }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="thinking-dot"
                  style={{ animationDelay: `${i * 0.25}s`, animation: "pulse-dot 1.2s ease-in-out infinite" }}
                />
              ))}
            </div>
            <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)", fontWeight: 500 }}>
              Orchestrator working...
            </span>
          </div>
        )}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}
