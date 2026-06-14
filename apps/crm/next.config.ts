import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Enable server actions (used for mutations)
    serverActions: {
      allowedOrigins: ["localhost:3000"],
    },
  },
  // Transpile shared packages from the monorepo
  transpilePackages: ["@xeno/shared-types"],
  // Silence the "multiple lockfiles" Turbopack warning caused by a stray
  // package-lock.json above the repo root. Point explicitly to this monorepo.
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
};

export default nextConfig;
