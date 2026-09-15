import { NextRequest, NextResponse } from "next/server"
import { RELEASES_BASE_URL } from "@/lib/releases"

// Thin redirect into Cloudflare R2's public custom domain — the actual APK
// bytes are served directly from Cloudflare's edge, not proxied through this
// app server. Kept (rather than removed outright) purely as a stable URL
// safety net for anyone who bookmarked/shared an old /api/android/download/*
// link; new links (the landing page's AndroidDownload button) go straight to
// R2 and never hit this route — see lib/android/release.ts.
// GET /api/android/download/<key>
export async function GET(_request: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params
  const objectKey = key.join("/")
  if (!objectKey || objectKey.includes("..")) {
    return NextResponse.json({ error: "Bad key" }, { status: 400 })
  }
  return NextResponse.redirect(`${RELEASES_BASE_URL}/android/${objectKey}`, 302)
}
