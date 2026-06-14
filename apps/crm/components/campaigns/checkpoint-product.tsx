"use client";

import { useState } from "react";
import { ShoppingBag, Check, X, Minus, Plus as PlusIcon } from "lucide-react";
import type { ProductAgentOutput, Product } from "@/types";

interface CheckpointProductProps {
  runId: string;
  data: ProductAgentOutput;
  onApprove: () => void;
  onCancel: () => void;
}

function formatPrice(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export function CheckpointProduct({
  runId,
  data,
  onApprove,
  onCancel,
}: CheckpointProductProps) {
  const [primary, setPrimary] = useState<Product[]>(data.primaryProducts);
  const [crossSells, setCrossSells] = useState<Product[]>(data.crossSellSuggestions);
  const [included, setIncluded] = useState<Set<string>>(
    new Set([...data.primaryProducts.map((p) => p.id), ...data.crossSellSuggestions.map((p) => p.id)])
  );
  const [isLoading, setIsLoading] = useState(false);

  function toggleProduct(product: Product, inSet: boolean) {
    const next = new Set(included);
    if (inSet) next.delete(product.id);
    else next.add(product.id);
    setIncluded(next);
  }

  async function handleApprove() {
    setIsLoading(true);
    const edits = [
      ...primary.map((p) => ({ id: p.id, name: p.name, action: included.has(p.id) ? "keep" as const : "remove" as const })),
      ...crossSells.map((p) => ({ id: p.id, name: p.name, action: included.has(p.id) ? "add" as const : "remove" as const })),
    ];
    const hasEdits = edits.some((e) => e.action !== "keep");
    await fetch(`/api/orchestrator/${runId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkpoint: "PRODUCT",
        action: hasEdits ? "edit" : "approve",
        ...(hasEdits ? { editedProducts: edits } : {}),
      }),
    });
    onApprove();
  }

  async function handleCancel() {
    await fetch(`/api/orchestrator/${runId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkpoint: "PRODUCT", action: "cancel" }),
    });
    onCancel();
  }

  const ProductCard = ({ product, isIncluded }: { product: Product; isIncluded: boolean }) => (
    <div
      className="card-elevated"
      style={{
        padding: "1.25rem",
        opacity: isIncluded ? 1 : 0.45,
        transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        border: isIncluded ? "1px solid rgba(255, 79, 0, 0.15)" : "1px solid var(--border)",
        background: isIncluded ? "rgba(255, 79, 0, 0.02)" : "var(--bg-elevated)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1.25rem" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: "0.9375rem", color: "var(--text-primary)", marginBottom: "0.25rem" }}>
            {product.name}
          </div>
          <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.5rem", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
            {product.description}
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <span className="badge badge-orange" style={{ textTransform: "capitalize" }}>{product.category}</span>
            <span style={{ fontWeight: 800, color: "var(--accent-primary)", fontSize: "0.9375rem" }}>
              {formatPrice(product.price)}
            </span>
          </div>
        </div>
        <button
          onClick={() => toggleProduct(product, isIncluded)}
          className={`btn btn-sm ${isIncluded ? "btn-danger" : "btn-ghost"}`}
          style={{ flexShrink: 0 }}
        >
          {isIncluded ? <Minus size={12} /> : <PlusIcon size={12} />}
          {isIncluded ? "Remove" : "Add"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="checkpoint-card animate-fade-in-up" style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: "18px" }}>
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
          <ShoppingBag size={18} color="var(--accent-primary)" />
        </div>
        <div>
          <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "2px" }}>
            Checkpoint 2 of 4
          </div>
          <h3 style={{ fontSize: "1.125rem", fontWeight: 800 }}>Product Selection</h3>
        </div>
        <span className="badge badge-orange" style={{ marginLeft: "auto" }}>Review Required</span>
      </div>

      {/* Primary products */}
      <div style={{ marginBottom: "1.75rem" }}>
        <div style={{ fontSize: "0.725rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
          Target Products ({primary.length})
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {primary.map((p) => (
            <ProductCard key={p.id} product={p} isIncluded={included.has(p.id)} />
          ))}
        </div>
      </div>

      {/* Cross-sell suggestions */}
      {crossSells.length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ fontSize: "0.725rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
            Cross-Sell Suggestions (Optional recommendations to add)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {crossSells.map((p) => (
              <ProductCard key={p.id} product={p} isIncluded={included.has(p.id)} />
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
        <button onClick={handleCancel} className="btn btn-danger btn-sm">
          <X size={14} />
          Cancel Run
        </button>
        <button
          onClick={handleApprove}
          className="btn btn-primary"
          disabled={isLoading || [...included].filter(id => primary.find(p => p.id === id)).length === 0}
        >
          <Check size={16} strokeWidth={2.5} />
          Approve Products
        </button>
      </div>
    </div>
  );
}
