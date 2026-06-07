import { NextResponse } from "next/server"

// Liveness/readiness probe for load balancers, Docker/Swarm health checks and
// uptime monitors. Public (see proxy.ts) and dependency-free so it stays fast
// and never flaps on transient backend issues.
export const dynamic = "force-dynamic"

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "pharmatrack-web",
    time: new Date().toISOString(),
  })
}
