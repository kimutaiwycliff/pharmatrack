import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent Next.js from bundling server-only heavy packages that use WASM/native bindings
  serverExternalPackages: ["@react-pdf/renderer", "@react-pdf/yoga"],
};

export default nextConfig;
