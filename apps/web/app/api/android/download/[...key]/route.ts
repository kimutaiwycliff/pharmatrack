import { NextRequest, NextResponse } from "next/server"
import { getAndroidReleaseObject } from "@/lib/storage/minio"

// Serves the Android APK + updater manifest from MinIO through the app (MinIO
// isn't exposed to the internet — same reasoning as /api/desktop/download and
// /api/media/<key>). latest.json is fetched directly (the landing page's
// AndroidDownload widget), so it's served inline as JSON; the APK forces a
// browser download.
// GET /api/android/download/<key>
export async function GET(_request: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params
  const objectKey = key.join("/")
  if (!objectKey || objectKey.includes("..")) {
    return NextResponse.json({ error: "Bad key" }, { status: 400 })
  }

  const obj = await getAndroidReleaseObject(objectKey)
  if (!obj) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const filename = objectKey.split("/").pop()!
  const isManifest = filename === "latest.json"

  return new NextResponse(obj.body as unknown as BodyInit, {
    headers: {
      "Content-Type": isManifest ? "application/json" : "application/vnd.android.package-archive",
      "Cache-Control": isManifest
        ? "public, max-age=60" // short cache - checked for update availability
        : "public, max-age=31536000, immutable", // APKs are versioned, never change
      ...(isManifest ? {} : { "Content-Disposition": `attachment; filename="${filename}"` }),
    },
  })
}
