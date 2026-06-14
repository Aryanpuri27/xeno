import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ textAlign: "center", padding: "6rem 2rem" }}>
      <div style={{ fontSize: "5rem", marginBottom: "1rem" }}>404</div>
      <h1 style={{ marginBottom: "0.5rem" }}>Page not found</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>
        The page you are looking for doesn&apos;t exist.
      </p>
      <Link href="/campaigns" className="btn btn-primary">
        Go to Campaigns
      </Link>
    </div>
  );
}
