import { NextRequest, NextResponse } from "next/server"
import { getDeviceContext } from "@/lib/sync/device-auth"
import { deviceCookie } from "@/lib/devices/lock"

// A browser or desktop till registered before ADR-018 keeps its device key in
// IndexedDB only. On start the till calls this once with that key
// (`Authorization: Device …`) and gets it back as the httpOnly `pt_device`
// cookie, so the device counts as approved when staff sign in on it.
export async function POST(request: NextRequest) {
  const ctx = await getDeviceContext(request)
  if ("error" in ctx) return ctx.error
  const token = (request.headers.get("authorization") ?? "").slice(7).trim()
  const res = NextResponse.json({ ok: true, device_id: ctx.device.id })
  res.headers.append("Set-Cookie", deviceCookie(token))
  return res
}
