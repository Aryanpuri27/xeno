"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Megaphone,
  BarChart3,
  Settings,
  Zap,
  ChevronRight,
  Package,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard",  href: "/",           icon: LayoutDashboard },
  { label: "Campaigns",  href: "/campaigns",  icon: Megaphone },
  { label: "Products",   href: "/products",   icon: Package },
  { label: "Analytics",  href: "/analytics",  icon: BarChart3 },
  { label: "Settings",   href: "/settings",   icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: "250px",
        minHeight: "100vh",
        background: "var(--bg-card)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        padding: "1.75rem 1.125rem",
        position: "sticky",
        top: 0,
      }}
    >
      {/* Logo */}
      <div style={{ marginBottom: "2.25rem", padding: "0 0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.875rem" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              background: "linear-gradient(135deg, #FF3300, #FF6B00)",
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 16px rgba(255, 51, 0, 0.25)",
            }}
          >
            <Zap size={18} color="white" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
              Xeno CRM
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "2px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Nike · AI-Native
            </div>
          </div>
        </div>
      </div>

      {/* New Campaign CTA */}
      <Link
        href="/campaigns/new"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.75rem 1rem",
          borderRadius: "10px",
          background: "rgba(255, 79, 0, 0.05)",
          border: "1px solid rgba(255, 79, 0, 0.15)",
          color: "#ff6019",
          fontSize: "0.875rem",
          fontWeight: 600,
          textDecoration: "none",
          marginBottom: "2rem",
          transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          boxShadow: "0 2px 8px rgba(255, 79, 0, 0.02)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255, 79, 0, 0.1)";
          (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255, 79, 0, 0.3)";
          (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-1px)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255, 79, 0, 0.05)";
          (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255, 79, 0, 0.15)";
          (e.currentTarget as HTMLAnchorElement).style.transform = "none";
        }}
      >
        <span>+ New Campaign</span>
        <ChevronRight size={14} />
      </Link>

      {/* Navigation */}
      <nav style={{ flex: 1 }}>
        <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.75rem", padding: "0 0.5rem" }}>
          Menu
        </div>
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "4px" }}>
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
            const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
            return (
              <li key={label}>
                <Link
                  href={href}
                  className={`nav-link ${isActive ? "active" : ""}`}
                >
                  <Icon size={16} strokeWidth={isActive ? 2.5 : 2} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div
        style={{
          padding: "1.125rem",
          borderRadius: "12px",
          background: "rgba(255, 255, 255, 0.02)",
          border: "1px solid var(--border)",
          marginTop: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.35rem" }}>
          <span className="status-dot running" style={{ width: "6px", height: "6px", background: "var(--accent-secondary)" }} />
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--accent-secondary)" }}>
            AI Orchestrator
          </div>
        </div>
        <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
          GPT-4o engine running with active HITL gates.
        </div>
      </div>
    </aside>
  );
}
