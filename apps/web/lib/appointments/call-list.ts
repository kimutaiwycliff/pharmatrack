// Appointment reminders without SMS: staff phone the client. This file holds
// the pure parts — which Nairobi day an appointment falls on, who should be
// told about it, and the morning "clients to call" email.
import { formatWhen } from "./reminders"
import { serviceLabel } from "./services"

const DAY_MS = 86_400_000

/** "YYYY-MM-DD" for `d` in Africa/Nairobi. */
export function nairobiYmd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(d)
}

/** Start of a Nairobi calendar day (UTC+3, no DST). */
export function nairobiDayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+03:00`)
}

/** Today and tomorrow in Nairobi, with the [start, end) window covering both. */
export function callWindow(now = new Date()) {
  const today = nairobiYmd(now)
  const start = nairobiDayStart(today)
  const tomorrow = nairobiYmd(new Date(start.getTime() + DAY_MS + 3_600_000))
  const end = new Date(start.getTime() + 2 * DAY_MS)
  return { today, tomorrow, start, end }
}

/** Hour of the day in Nairobi (0–23). */
export function nairobiHour(now = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", hour: "2-digit", hour12: false }).format(now)) % 24
}

export interface CallItem {
  id: string
  organizationId: string
  branchId: string | null
  scheduledAt: Date
  customerName: string
  customerPhone: string | null
  service: string | null
  branchName: string | null
  assignedTo: string | null
}

export interface Manager {
  organizationId: string
  userId: string
  /** null = every branch (owner, or a manager without a home branch). */
  branchId: string | null
}

/**
 * Who gets each appointment in their morning email: the assigned staff
 * member; an unassigned appointment goes to the pharmacy's owner and
 * managers (managers only for their own branch). Key: `${org}:${userId}`.
 */
export function digestRecipients(items: CallItem[], managers: Manager[]): Map<string, CallItem[]> {
  const out = new Map<string, CallItem[]>()
  const add = (org: string, userId: string, item: CallItem) => {
    const key = `${org}:${userId}`
    const list = out.get(key) ?? []
    if (!list.some((i) => i.id === item.id)) list.push(item)
    out.set(key, list)
  }
  for (const item of items) {
    if (item.assignedTo) {
      add(item.organizationId, item.assignedTo, item)
      continue
    }
    for (const m of managers) {
      if (m.organizationId !== item.organizationId) continue
      if (m.branchId && item.branchId && m.branchId !== item.branchId) continue
      add(m.organizationId, m.userId, item)
    }
  }
  for (const list of out.values()) list.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
  return out
}

export function escapeHtml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] ?? c))
}

function row(i: CallItem): string {
  const phone = i.customerPhone
    ? `<a href="tel:${escapeHtml(i.customerPhone)}" style="color:#15803d;font-weight:600">${escapeHtml(i.customerPhone)}</a>`
    : `<span style="color:#9ca3af">no phone on file</span>`
  return `<tr>
    <td style="padding:8px 10px;border-bottom:1px solid #eee;white-space:nowrap">${escapeHtml(formatWhen(i.scheduledAt))}</td>
    <td style="padding:8px 10px;border-bottom:1px solid #eee"><strong>${escapeHtml(i.customerName)}</strong><br><span style="color:#6b7280;font-size:13px">${escapeHtml(serviceLabel(i.service ?? "appointment"))}${i.branchName ? ` · ${escapeHtml(i.branchName)}` : ""}</span></td>
    <td style="padding:8px 10px;border-bottom:1px solid #eee;white-space:nowrap">${phone}</td>
  </tr>`
}

function table(items: CallItem[]): string {
  return `<table style="border-collapse:collapse;width:100%;font-size:14px">${items.map(row).join("")}</table>`
}

/** The 06:00 email: tomorrow's clients to call, plus today's appointments. */
export function staffDigestEmail(args: {
  recipientName: string
  orgName: string
  today: CallItem[]
  tomorrow: CallItem[]
  appUrl: string
}): { subject: string; html: string } {
  const n = args.tomorrow.length
  const subject = n > 0
    ? `${n} client${n === 1 ? "" : "s"} to call today — appointments tomorrow`
    : `Today's appointments at ${args.orgName}`
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:620px;color:#111827">
      <p>Hi ${escapeHtml(args.recipientName.split(" ")[0] ?? args.recipientName)},</p>
      ${n > 0 ? `
        <h2 style="margin:18px 0 6px;font-size:18px">Call to remind them — appointments tomorrow</h2>
        <p style="margin:0 0 10px;color:#4b5563">SMS reminders aren't switched on, so please phone these clients today.</p>
        ${table(args.tomorrow)}` : ""}
      ${args.today.length > 0 ? `
        <h2 style="margin:22px 0 6px;font-size:18px">Today's appointments</h2>
        ${table(args.today)}` : ""}
      <p style="margin-top:22px"><a href="${escapeHtml(args.appUrl)}/appointments" style="background:#15803d;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Open appointments</a></p>
      <p style="color:#6b7280;font-size:13px;margin-top:18px">Mark each call as done on your dashboard so the team knows who has been reminded. — ${escapeHtml(args.orgName)} on PharmaTrack</p>
    </div>`
  return { subject, html }
}
