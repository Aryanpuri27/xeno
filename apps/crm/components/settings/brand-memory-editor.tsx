"use client";

import { useState } from "react";
import { Save, RotateCcw, CheckCircle, AlertCircle, Loader } from "lucide-react";
import type { BrandMemory } from "@/lib/memory/brand";

const TONE_OPTIONS: BrandMemory["brandTone"][] = [
  "Premium", "Casual", "Playful", "Professional", "Urgent", "Motivational",
];
const CTA_OPTIONS: BrandMemory["ctaStyle"][] = [
  "discount-first", "value-first", "urgency-first",
];
const CHANNEL_OPTIONS: ("whatsapp" | "email" | "sms" | "rcs")[] = [
  "whatsapp", "email", "sms", "rcs",
];

type SaveState = "idle" | "saving" | "saved" | "error";

export function BrandMemoryEditor({ initial }: { initial: BrandMemory }) {
  const [form, setForm] = useState<BrandMemory>(initial);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const set = <K extends keyof BrandMemory>(key: K, value: BrandMemory[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleChannel = (ch: "whatsapp" | "email" | "sms" | "rcs") => {
    const current = form.preferredChannels;
    const next = current.includes(ch)
      ? current.filter((c) => c !== ch)
      : [...current, ch];
    set("preferredChannels", next);
  };

  const handleArrayField = (key: "bestPerformingCategories" | "avoidTopics", raw: string) => {
    set(key, raw.split(",").map((s) => s.trim()).filter(Boolean));
  };

  const handleSave = async () => {
    setSaveState("saving");
    setErrorMsg("");
    try {
      const res = await fetch("/api/settings/brand", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
    } catch (err) {
      setErrorMsg((err as Error).message);
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 4000);
    }
  };

  const handleReset = () => {
    setForm(initial);
    setSaveState("idle");
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.725rem",
    fontWeight: 700,
    color: "var(--text-secondary)",
    marginBottom: "0.5rem",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  };

  const fieldStyle: React.CSSProperties = { display: "flex", flexDirection: "column" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Text fields */}
      <div className="card">
        <h3 style={{ marginBottom: "1.5rem", fontSize: "1.125rem", fontWeight: 700 }}>Brand Identity</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Brand Name</label>
            <input
              id="setting-brand-name"
              className="input"
              value={form.brandName}
              onChange={(e) => set("brandName", e.target.value)}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Target Demographic</label>
            <input
              id="setting-target-demographic"
              className="input"
              value={form.targetDemographic}
              onChange={(e) => set("targetDemographic", e.target.value)}
            />
          </div>
          <div style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Brand Voice Guidelines</label>
            <textarea
              id="setting-brand-voice"
              className="input"
              style={{ minHeight: "96px" }}
              value={form.brandVoice ?? ""}
              onChange={(e) => set("brandVoice", e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Tone */}
      <div className="card">
        <h3 style={{ marginBottom: "1.25rem", fontSize: "1.125rem", fontWeight: 700 }}>Brand Tone</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.625rem" }}>
          {TONE_OPTIONS.map((tone) => {
            const active = form.brandTone === tone;
            return (
              <button
                key={tone}
                id={`setting-tone-${tone.toLowerCase()}`}
                onClick={() => set("brandTone", tone)}
                style={{
                  padding: "0.5rem 1.125rem",
                  borderRadius: "9999px",
                  border: active
                    ? "1px solid var(--accent-primary)"
                    : "1px solid var(--border)",
                  background: active
                    ? "rgba(255, 79, 0, 0.08)"
                    : "rgba(255,255,255,0.01)",
                  color: active
                    ? "#ff6d24"
                    : "var(--text-secondary)",
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
                {tone}
              </button>
            );
          })}
        </div>
      </div>

      {/* CTA Style */}
      <div className="card">
        <h3 style={{ marginBottom: "1.25rem", fontSize: "1.125rem", fontWeight: 700 }}>CTA Style</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.625rem" }}>
          {CTA_OPTIONS.map((cta) => {
            const active = form.ctaStyle === cta;
            return (
              <button
                key={cta}
                id={`setting-cta-${cta}`}
                onClick={() => set("ctaStyle", cta)}
                style={{
                  padding: "0.5rem 1.125rem",
                  borderRadius: "9999px",
                  border: active
                    ? "1px solid var(--accent-secondary)"
                    : "1px solid var(--border)",
                  background: active
                    ? "rgba(139, 92, 246, 0.08)"
                    : "rgba(255,255,255,0.01)",
                  color: active
                    ? "#c084fc"
                    : "var(--text-secondary)",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                  textTransform: "capitalize",
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
                {cta.replace("-", " ")}
              </button>
            );
          })}
        </div>
      </div>

      {/* Preferred Channels */}
      <div className="card">
        <h3 style={{ marginBottom: "1.25rem", fontSize: "1.125rem", fontWeight: 700 }}>Preferred Channels</h3>
        <div style={{ display: "flex", gap: "0.625rem", flexWrap: "wrap" }}>
          {CHANNEL_OPTIONS.map((ch) => {
            const active = form.preferredChannels.includes(ch);
            const emojis: Record<string, string> = { whatsapp: "💬", email: "📧", sms: "📱", rcs: "🔔" };
            return (
              <button
                key={ch}
                id={`setting-channel-${ch}`}
                onClick={() => toggleChannel(ch)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.625rem",
                  padding: "0.625rem 1.25rem",
                  borderRadius: "12px",
                  border: active ? "1px solid var(--accent-cyan)" : "1px solid var(--border)",
                  background: active ? "rgba(6, 182, 212, 0.08)" : "rgba(255,255,255,0.01)",
                  color: active ? "#22d3ee" : "var(--text-secondary)",
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
                <span>{emojis[ch]}</span>
                <span>{ch.toUpperCase()}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Array fields */}
      <div className="card">
        <h3 style={{ marginBottom: "1.5rem", fontSize: "1.125rem", fontWeight: 700 }}>Performance & Restrictions</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Best Performing Categories (comma-separated)</label>
            <input
              id="setting-best-categories"
              className="input"
              value={form.bestPerformingCategories.join(", ")}
              onChange={(e) => handleArrayField("bestPerformingCategories", e.target.value)}
              placeholder="running, basketball, lifestyle"
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Avoid Topics (comma-separated)</label>
            <input
              id="setting-avoid-topics"
              className="input"
              value={form.avoidTopics.join(", ")}
              onChange={(e) => handleArrayField("avoidTopics", e.target.value)}
              placeholder="competitor comparisons, heavy discounting"
            />
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.5rem" }}>
        <button
          id="settings-save-btn"
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saveState === "saving"}
          style={{ minWidth: "140px" }}
        >
          {saveState === "saving" ? (
            <><Loader size={14} className="spin" /> Saving…</>
          ) : saveState === "saved" ? (
            <><CheckCircle size={14} /> Saved!</>
          ) : (
            <><Save size={14} /> Save Changes</>
          )}
        </button>
        <button
          id="settings-reset-btn"
          className="btn btn-ghost"
          onClick={handleReset}
          disabled={saveState === "saving"}
        >
          <RotateCcw size={14} /> Reset
        </button>
        {saveState === "error" && (
          <span style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.875rem", color: "var(--accent-red)" }}>
            <AlertCircle size={14} /> {errorMsg || "Failed to save"}
          </span>
        )}
      </div>
    </div>
  );
}
