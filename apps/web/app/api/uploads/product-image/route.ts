import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { presignProductUpload } from "@/lib/storage/minio"
import { getTenantContext, type Role } from "@/lib/auth/helpers"

const schema = z.object({
  content_type: z.string().regex(/^image\/(png|jpe?g|webp|gif|avif)$/, "Unsupported image type"),
  ext: z.string().regex(/^[a-z0-9]{1,5}$/i).optional(),
})

const WRITE_ROLES: Role[] = ["owner", "manager", "pharmacist"]

// Issues a presigned PUT URL so the browser uploads the product image straight to
// MinIO; returns the public URL to store on the product.
export async function POST(request: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!WRITE_ROLES.includes(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })

  const ext = parsed.data.ext ?? parsed.data.content_type.split("/")[1] ?? "jpg"
  const key = `${ctx.organizationId}/${randomUUID()}.${ext}`
  const { url, publicUrl } = await presignProductUpload(key, parsed.data.content_type)
  return NextResponse.json({ uploadUrl: url, publicUrl })
}
