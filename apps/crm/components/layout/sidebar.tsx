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
        width: "240px",
        minHeight: "100vh",
        background: "var(--bg-card)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        padding: "1.5rem 1rem",
        position: "sticky",
        top: 0,
      }}
    >
      {/* Logo */}
      <div style={{ marginBottom: "2rem", padding: "0 0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              background: "linear-gradient(135deg, #FF6B00, #FF9A00)",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 16px rgba(255, 107, 0, 0.4)",
            }}
          >
            <Zap size={16} color="white" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Xeno CRM
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "1px" }}>
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
          padding: "0.625rem 0.875rem",
          borderRadius: "8px",
          background: "rgba(255, 107, 0, 0.1)",
          border: "1px solid rgba(255, 107, 0, 0.2)",
          color: "var(--accent-primary)",
          fontSize: "0.875rem",
          fontWeight: 600,
          textDecoration: "none",
          marginBottom: "1.5rem",
          transition: "all 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255, 107, 0, 0.15)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255, 107, 0, 0.1)";
        }}
      >
        <span>+ New Campaign</span>
        <ChevronRight size={14} />
      </Link>

      {/* Navigation */}
      <nav style={{ flex: 1 }}>
        <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem", padding: "0 0.5rem" }}>
          Menu
        </div>
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "2px" }}>
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
          padding: "1rem",
          borderRadius: "8px",
          background: "rgba(124, 58, 237, 0.06)",
          border: "1px solid rgba(124, 58, 237, 0.12)",
          marginTop: "1rem",
        }}
      >
        <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--accent-secondary)", marginBottom: "0.25rem" }}>
          AI Orchestrator
        </div>
        <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
          Powered by GPT-4o with HITL review gates
        </div>
      </div>
    </aside>
  );
}
