import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { putProductImage } from "@/lib/storage/minio"
import { getTenantContext, type Role } from "@/lib/auth/helpers"

const WRITE_ROLES: Role[] = ["owner", "manager", "pharmacist"]
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const ALLOWED = /^image\/(png|jpe?g|webp|gif|avif)$/

// Receives the image file (multipart) and uploads it to MinIO server-side — the
// browser can't reach MinIO directly, so this is the only reliable path. Returns
// the app-served public URL to store on the product.
export async function POST(request: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!WRITE_ROLES.includes(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
  if (!ALLOWED.test(file.type)) return NextResponse.json({ error: "Unsupported image type" }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image must be 5 MB or smaller" }, { status: 400 })

  const sub = file.type.split("/")[1]
  const ext = sub === "jpeg" ? "jpg" : (sub ?? "jpg")
  const key = `${ctx.organizationId}/${randomUUID()}.${ext}`
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    const publicUrl = await putProductImage(key, buf, file.type)
    return NextResponse.json({ publicUrl })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 500 })
  }
}
