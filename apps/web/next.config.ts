import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Pin the Turbopack workspace root to this monorepo. Without this, Next walks up
// looking for a lockfile, finds a stray ~/package-lock.json, and picks the user's
// HOME directory as the root — making Turbopack watch the entire home tree and leak
// memory until the dev server OOMs. Use an absolute path (a relative string here
// triggers a Next path bug); resolve two levels up from apps/web.
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const nextConfig: NextConfig = {
  turbopack: { root: repoRoot },
  // Self-contained build output for Docker/VM deploys (apps/web/.next/standalone).
  output: "standalone",
  // In a pnpm monorepo, trace files from the repo root so standalone bundles
  // workspace deps correctly.
  outputFileTracingRoot: repoRoot,
  // Prevent Next.js from bundling server-only heavy packages that use WASM/native bindings
  serverExternalPackages: ["@react-pdf/renderer", "@react-pdf/yoga"],
};

export default nextConfig;
