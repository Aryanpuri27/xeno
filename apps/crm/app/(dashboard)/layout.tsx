import { Sidebar } from "@/components/layout/sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <main
        style={{
          flex: 1,
          padding: "2rem",
          overflowY: "auto",
          maxHeight: "100vh",
        }}
      >
        {children}
      </main>
    </div>
  );
}
