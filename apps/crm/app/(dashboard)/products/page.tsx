import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { Package, CheckCircle2, XCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "Products",
  description: "Nike product catalog",
};

const CATEGORY_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  running:     { bg: "rgba(255, 79, 0, 0.08)",  color: "#ff6d24", border: "rgba(255, 79, 0, 0.18)" },
  basketball:  { bg: "rgba(6, 182, 212, 0.08)", color: "#22d3ee", border: "rgba(6, 182, 212, 0.18)" },
  lifestyle:   { bg: "rgba(139, 92, 246, 0.08)", color: "#c084fc", border: "rgba(139, 92, 246, 0.18)" },
  training:    { bg: "rgba(16, 185, 129, 0.08)", color: "#34d399", border: "rgba(16, 185, 129, 0.18)" },
  apparel:     { bg: "rgba(245, 158, 11, 0.08)", color: "#fbbf24", border: "rgba(245, 158, 11, 0.18)" },
  accessories: { bg: "rgba(244, 63, 94, 0.08)",  color: "#fb7185", border: "rgba(244, 63, 94, 0.18)" },
};

export default async function ProductsPage() {
  const products = await db.product.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  // Group by category
  const byCategory = products.reduce<Record<string, typeof products>>((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {});

  const categories = Object.keys(byCategory).sort();

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "1rem 0" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "2.5rem", gap: "2rem" }}>
        <div>
          <h1 style={{ marginBottom: "0.5rem" }}>
            <span className="text-gradient">Product Catalog</span>
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem", margin: 0 }}>
            {products.length} products across {categories.length} segments in Nike system
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {categories.map((cat) => {
            const style = CATEGORY_COLORS[cat] ?? { bg: "rgba(255,255,255,0.04)", color: "var(--text-secondary)", border: "var(--border)" };
            return (
              <span
                key={cat}
                style={{
                  padding: "0.35rem 0.875rem",
                  borderRadius: "9999px",
                  background: style.bg,
                  color: style.color,
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  textTransform: "capitalize",
                  border: `1px solid ${style.border}`,
                }}
              >
                {cat} ({byCategory[cat]?.length ?? 0})
              </span>
            );
          })}
        </div>
      </div>

      {/* Categories */}
      {categories.map((cat) => {
        const style = CATEGORY_COLORS[cat] ?? { bg: "rgba(255,255,255,0.04)", color: "var(--text-secondary)", border: "var(--border)" };
        return (
          <div key={cat} style={{ marginBottom: "2.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "1rem" }}>
              <span
                style={{
                  width: "6px", height: "6px", borderRadius: "50%",
                  background: style.color, flexShrink: 0,
                  boxShadow: `0 0 10px ${style.color}`,
                }}
              />
              <h2 style={{ fontSize: "1.125rem", fontWeight: 800, color: "var(--text-primary)", textTransform: "capitalize", margin: 0 }}>
                {cat}
              </h2>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>
                ({byCategory[cat]?.length ?? 0} products)
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1rem" }}>
              {(byCategory[cat] ?? []).map((product) => (
                <div
                  key={product.id}
                  className="card"
                  style={{ padding: "1.25rem 1.5rem", position: "relative" }}
                >
                  {/* Stock indicator */}
                  <div
                    style={{
                      position: "absolute",
                      top: "1.25rem",
                      right: "1.5rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      fontSize: "0.725rem",
                      fontWeight: 700,
                      color: product.inStock ? "var(--accent-green)" : "var(--accent-red)",
                    }}
                  >
                    <span
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: product.inStock ? "var(--accent-green)" : "var(--accent-red)",
                        boxShadow: `0 0 8px ${product.inStock ? "var(--accent-green)" : "var(--accent-red)"}`
                      }}
                    />
                    {product.inStock ? "IN STOCK" : "OUT OF STOCK"}
                  </div>

                  <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
                    {/* Category icon */}
                    <div
                      style={{
                        width: "40px", height: "40px", borderRadius: "10px",
                        background: style.bg,
                        border: `1px solid ${style.border}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Package size={18} color={style.color} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0, paddingRight: "5rem" }}>
                      <div style={{ fontWeight: 800, fontSize: "0.9375rem", color: "var(--text-primary)", marginBottom: "0.25rem" }}>
                        {product.name}
                      </div>
                      <div style={{ fontSize: "0.725rem", color: "var(--text-muted)", marginBottom: "0.625rem", fontFamily: "monospace", fontWeight: 600 }}>
                        SKU: {product.sku}
                      </div>
                      <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: "1rem", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", height: "3.6em" }}>
                        {product.description}
                      </p>
                      <div style={{ fontSize: "1.25rem", fontWeight: 850, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
                        ₹{product.price.toLocaleString("en-IN")}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {products.length === 0 && (
        <div
          className="card"
          style={{
            textAlign: "center",
            padding: "5rem 2rem",
            background: "rgba(13, 13, 17, 0.4)",
            border: "1px dashed var(--border-strong)",
            borderRadius: "20px",
            maxWidth: "600px",
            margin: "2rem auto 0",
          }}
        >
          <div style={{ fontSize: "3rem", marginBottom: "1.5rem" }}>📦</div>
          <h2 style={{ marginBottom: "0.75rem" }}>No products populated</h2>
          <p style={{ color: "var(--text-secondary)" }}>Populate the product database catalog using seed script query.</p>
        </div>
      )}
    </div>
  );
}
