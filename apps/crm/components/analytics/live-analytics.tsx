"use client";

import { useEffect, useState } from "react";
import type { AnalyticsSnapshot } from "@/types";

interface LiveAnalyticsProps {
  campaignId: string;
  initialStats: AnalyticsSnapshot;
}

export function LiveAnalytics({ campaignId, initialStats }: LiveAnalyticsProps) {
  const [stats, setStats] = useState<AnalyticsSnapshot>(initialStats);

  useEffect(() => {
    if (initialStats.status === "COMPLETED" || initialStats.status === "FAILED") return;

    const es = new EventSource(`/api/analytics/${campaignId}/stream`);
    es.onmessage = (event) => {
      const data = JSON.parse(event.data) as AnalyticsSnapshot;
      setStats(data);
      if (data.status === "COMPLETED" || data.status === "FAILED") {
        es.close();
      }
    };
    return () => es.close();
  }, [campaignId, initialStats.status]);

  const metrics = [
    { label: "Total Sent", value: stats.totalSent.toLocaleString(), color: "var(--text-primary)" },
    { label: "Delivered", value: `${stats.delivered.toLocaleString()}`, sub: `${stats.deliveryRate}%`, color: "var(--accent-cyan)" },
    { label: "Opened", value: `${stats.opened.toLocaleString()}`, sub: `${stats.openRate}%`, color: "var(--accent-secondary)" },
    { label: "Clicked", value: `${stats.clicked.toLocaleString()}`, sub: `${stats.ctr}%`, color: "var(--accent-primary)" },
    { label: "Converted", value: `${stats.converted.toLocaleString()}`, sub: `${stats.conversionRate}%`, color: "var(--accent-green)" },
    { label: "Failed", value: `${stats.failed.toLocaleString()}`, color: "var(--accent-red)" },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "1.5rem" }}>
        {stats.status === "RUNNING" && (
          <div className="status-dot running" style={{ background: "var(--accent-cyan)", width: "8px", height: "8px" }} />
        )}
        <h3 style={{ fontSize: "1.125rem", fontWeight: 800, margin: 0 }}>
          {stats.status === "RUNNING" ? "Live Campaign Performance" : "Campaign Delivery Summary"}
        </h3>
        {stats.status === "RUNNING" && (
          <span className="badge badge-cyan animate-pulse-dot" style={{ fontSize: "0.6875rem", fontWeight: 700 }}>LIVE TRACKING</span>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
        {metrics.map((m) => (
          <div key={m.label} className="metric-card">
            <div className="metric-label">{m.label}</div>
            <div className="metric-value" style={{ color: m.color, letterSpacing: "-0.03em" }}>{m.value}</div>
            {m.sub && (
              <div style={{ fontSize: "0.75rem", color: m.color, opacity: 0.8, fontWeight: 600, marginTop: "2px" }}>{m.sub} rate</div>
            )}
          </div>
        ))}
      </div>

      {/* Funnel */}
      {stats.totalSent > 0 && (
        <div style={{ marginTop: "2rem", borderTop: "1px solid var(--border)", paddingTop: "1.5rem" }}>
          <div style={{ fontSize: "0.725rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "1rem" }}>
            Conversion Funnel Analysis
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            {[
              { label: "Delivered Messages", count: stats.delivered, total: stats.totalSent, color: "var(--accent-cyan)" },
              { label: "Opened Messages", count: stats.opened, total: stats.delivered, color: "var(--accent-secondary)" },
              { label: "Clicked CTA Links", count: stats.clicked, total: stats.opened, color: "var(--accent-primary)" },
              { label: "Converted Purchases", count: stats.converted, total: stats.clicked, color: "var(--accent-green)" },
            ].map((bar) => (
              <div key={bar.label}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", marginBottom: "0.35rem", fontWeight: 500 }}>
                  <span style={{ color: "var(--text-secondary)" }}>{bar.label}</span>
                  <span style={{ color: bar.color, fontWeight: 700 }}>
                    {bar.count.toLocaleString()} {bar.total > 0 ? `(${Math.round((bar.count / bar.total) * 100)}%)` : "—"}
                  </span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{
                      width: bar.total > 0 ? `${Math.min(100, (bar.count / bar.total) * 100)}%` : "0%",
                      background: `linear-gradient(90deg, ${bar.color}, ${bar.color}cc)`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
