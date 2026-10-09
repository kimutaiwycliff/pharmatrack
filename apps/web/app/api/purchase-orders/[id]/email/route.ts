import { NextRequest, NextResponse } from "next/server"
import { createElement, type ReactElement } from "react"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer"
import { withTenant, purchase_order, audit_log } from "@pharmatrack/db"
import { getApiContext } from "@/lib/api-auth"
import { loadPurchaseOrder } from "@/lib/purchasing/load"
import { loadOrgProfile } from "@/lib/purchasing/orgProfile"
import { sendEmail } from "@/lib/notifications/email"
import { PurchaseOrderPDFDocument } from "@/components/purchasing/PurchaseOrderPDF"

const schema = z.object({
  to: z.string().email(),
  message: z.string().max(2000).optional(),
  show_prices: z.boolean().default(true),
})

const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

// POST /api/purchase-orders/:id/email — render the PO PDF server-side and email
// it to the supplier (Resend), then mark a draft as sent.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getApiContext({ permission: "purchasing.manage" })
  if ("error" in ctx) return ctx.error
  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  const { to, message, show_prices } = parsed.data
  const canSeeCost = ctx.permissions.includes("cost.view")

  const order = await withTenant(ctx, (db) => loadPurchaseOrder(db, id, canSeeCost))
  if (!order) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 })
  if (order.status === "cancelled") return NextResponse.json({ error: "This order was cancelled" }, { status: 409 })

  const org = await loadOrgProfile(ctx.organizationId)
  const doc = createElement(PurchaseOrderPDFDocument, { order, org, showPrices: show_prices && canSeeCost }) as unknown as ReactElement<DocumentProps>
  const pdf = await renderToBuffer(doc)

  const intro = message?.trim()
    ? escapeHtml(message.trim()).replace(/\n/g, "<br/>")
    : `Please find attached purchase order <b>${escapeHtml(order.po_number)}</b>${order.expected_date ? `, requested for delivery by ${escapeHtml(order.expected_date)}` : ""}.`
  const html = `<p>Hello${order.supplier_name ? ` ${escapeHtml(order.supplier_name)}` : ""},</p>
<p>${intro}</p>
<p>Kindly confirm availability and quote <b>${escapeHtml(order.po_number)}</b> on your invoice and delivery note.</p>
<p>Regards,<br/>${escapeHtml(org.name)}${org.phone ? `<br/>${escapeHtml(org.phone)}` : ""}</p>`

  const result = await sendEmail(to, `Purchase order ${order.po_number} — ${org.name}`, html, {
    attachments: [{ filename: `${order.po_number}.pdf`, content: Buffer.from(pdf).toString("base64") }],
    replyTo: org.email ?? undefined,
  })
  if (result.status === "skipped") {
    return NextResponse.json({ error: "Email isn't set up on this server — download the PDF and send it yourself." }, { status: 503 })
  }
  if (result.status === "failed") {
    return NextResponse.json({ error: "The email couldn't be sent. Try again, or download the PDF." }, { status: 502 })
  }

  await withTenant(ctx, async (db) => {
    if (order.status === "draft") {
      await db.update(purchase_order).set({ status: "sent", sent_at: new Date(), updated_at: new Date() }).where(eq(purchase_order.id, id))
    }
    await db.insert(audit_log).values({
      organization_id: ctx.organizationId, actor_id: ctx.userId, action: "purchase_order.email",
      entity: "purchase_order", entity_id: id, diff: { po_number: order.po_number, to },
    })
  })
  return NextResponse.json({ ok: true, sent_to: to })
}
