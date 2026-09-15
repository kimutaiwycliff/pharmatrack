import { NextRequest, NextResponse } from "next/server"
import { RELEASES_BASE_URL } from "@/lib/releases"

// Thin redirect into Cloudflare R2's public custom domain — the actual bytes
// are served directly from Cloudflare's edge, not proxied through this app
// server. This route only still exists because the DESKTOP APP'S AUTO-UPDATER
// has this exact URL hardcoded (apps/desktop/src-tauri/tauri.conf.json's
// updater.endpoints), baked into every already-installed build — that can't
// retroactively change, so this URL has to keep working forever. New links
// (the landing page's DesktopDownload button) go straight to R2 and never
// hit this route at all; see lib/desktop/release.ts.
// GET /api/desktop/download/<key>
export async function GET(_request: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params
  const objectKey = key.join("/")
  if (!objectKey || objectKey.includes("..")) {
    return NextResponse.json({ error: "Bad key" }, { status: 400 })
  }
  return NextResponse.redirect(`${RELEASES_BASE_URL}/desktop/${objectKey}`, 302)
}
