import type { Metadata } from "next";
import { getBrandMemory } from "@/lib/memory/brand";
import { BrandMemoryEditor } from "@/components/settings/brand-memory-editor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Settings",
  description: "Nike CRM brand memory settings",
};

export default async function SettingsPage() {
  const brand = await getBrandMemory();

  return (
    <div style={{ maxWidth: "760px" }}>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ marginBottom: "0.375rem" }}>
          <span className="text-gradient">Settings</span>
        </h1>
        <p style={{ color: "var(--text-secondary)" }}>
          Edit brand memory &amp; AI orchestrator configuration. Changes take effect on the next campaign.
        </p>
      </div>

      <BrandMemoryEditor initial={brand} />

      {/* Read-only AI info card */}
      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h3 style={{ marginBottom: "0.75rem" }}>AI Orchestrator</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.6 }}>
          Powered by <strong style={{ color: "var(--text-primary)" }}>GPT-4o</strong> with OpenAI function calling.
          Memory uses <strong style={{ color: "var(--text-primary)" }}>text-embedding-ada-002</strong> + pgvector for semantic search.
          HITL review gates enforce human approval at every campaign checkpoint.
        </p>
        <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <span className="badge badge-violet">GPT-4o Orchestrator</span>
          <span className="badge badge-cyan">pgvector Memory</span>
          <span className="badge badge-orange">HITL Gates</span>
          <span className="badge badge-green">BullMQ Queue</span>
        </div>
      </div>
    </div>
  );
}
