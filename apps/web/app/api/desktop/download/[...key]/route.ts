import { NextRequest, NextResponse } from "next/server"
import { getDesktopReleaseObject } from "@/lib/storage/minio"

// Serves desktop installers + the updater manifest from MinIO through the app
// (MinIO isn't exposed to the internet - same reasoning as /api/media/<key>).
// latest.json is fetched directly (by the Tauri updater and the landing page),
// so it's served inline as JSON; actual installers force a browser download.
// GET /api/desktop/download/<key>
export async function GET(_request: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params
  const objectKey = key.join("/")
  if (!objectKey || objectKey.includes("..")) {
    return NextResponse.json({ error: "Bad key" }, { status: 400 })
  }

  const obj = await getDesktopReleaseObject(objectKey)
  if (!obj) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const filename = objectKey.split("/").pop()!
  const isManifest = filename === "latest.json"

  return new NextResponse(obj.body as unknown as BodyInit, {
    headers: {
      "Content-Type": isManifest ? "application/json" : obj.contentType,
      "Cache-Control": isManifest
        ? "public, max-age=60" // short cache - this is checked for update availability
        : "public, max-age=31536000, immutable", // installers are versioned, never change
      ...(isManifest ? {} : { "Content-Disposition": `attachment; filename="${filename}"` }),
    },
  })
}
