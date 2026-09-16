import { NextRequest, NextResponse } from "next/server"
import { getProductObject } from "@/lib/storage"

// Serves product images from MinIO through the app (MinIO isn't exposed to the
// internet). Object keys are unguessable UUIDs; images are non-sensitive, so this
// is public + long-cached (Cloudflare caches it at the edge). GET /api/media/<key>
export async function GET(_request: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params
  const objectKey = key.join("/")
  if (!objectKey || objectKey.includes("..")) {
    return NextResponse.json({ error: "Bad key" }, { status: 400 })
  }

  const obj = await getProductObject(objectKey)
  if (!obj) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return new NextResponse(obj.body as unknown as BodyInit, {
    headers: {
      "Content-Type": obj.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  })
}
