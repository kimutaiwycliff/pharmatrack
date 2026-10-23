import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSession } from "@/lib/auth/helpers"
import { recordActivity } from "@/lib/insights/activity"

// POST /api/activity — "I'm using PharmaTrack" from an open web or desktop
// window (components/ActivityPing.tsx), for the operator's usage insights.
// Throttled server-side to one record per person per app per 5 minutes.
const body = z.object({ source: z.enum(["web", "desktop"]) })

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  await recordActivity({ userId: session.user.id, source: parsed.data.source })
  return new NextResponse(null, { status: 204 })
}
