import type { Overview, TenantOverview } from "./overview"

// The operator's Monday email: how the platform did last month, and which
// pharmacies to call this week (inactive, at risk, never started, trials
// ending, follow-ups due). Pure — the cron route supplies the overview.

const DAY = 86_400_000
const NAIROBI_MS = 3 * 3_600_000

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
const kes = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`

/** ISO week key in Nairobi time, e.g. "2026-W43" — one digest per week. */
export function isoWeekKey(now = Date.now()): string {
  const local = new Date(now + NAIROBI_MS)
  const date = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum) // Thursday of this ISO week
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((date.getTime() - yearStart) / DAY + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`
}

/** Monday from 07:00 Nairobi — when the weekly digest goes out. */
export function isDigestTime(now = Date.now()): boolean {
  const d = new Date(now + NAIROBI_MS)
  return d.getUTCDay() === 1 && d.getUTCHours() >= 7
}

export interface DigestSections {
  attention: TenantOverview[]
  trialsEnding: TenantOverview[]
  followUps: TenantOverview[]
}

export function digestSections(o: Overview, now = Date.now()): DigestSections {
  const urgent = new Set(["inactive", "at_risk", "never_started", "slipping"])
  const weekAhead = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date(now + 7 * DAY))
  return {
    attention: o.tenants
      .filter((t) => urgent.has(t.health.level))
      .sort((a, b) => b.health.urgency - a.health.urgency || (b.revenuePrev30 ?? 0) - (a.revenuePrev30 ?? 0)),
    trialsEnding: o.tenants.filter((t) => t.subscriptionStatus === "trialing" && t.renewsAt != null && t.renewsAt >= now && t.renewsAt - now <= 7 * DAY),
    // overview.ts already drops follow-ups more than a week overdue
    followUps: o.tenants.filter((t) => t.followUpOn != null && t.followUpOn <= weekAhead),
  }
}

function row(t: TenantOverview, appUrl: string, extra: string) {
  return `<tr>
    <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb"><a href="${appUrl}/platform/${encodeURIComponent(t.id)}" style="color:#15803d;font-weight:600;text-decoration:none">${esc(t.name)}</a>
      <div style="color:#6b7280;font-size:12px">${esc(t.health.reasons[0] ?? t.health.label)}</div></td>
    <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;white-space:nowrap;font-size:13px">${esc(extra)}</td>
  </tr>`
}

function table(title: string, body: string) {
  return `<h3 style="margin:24px 0 8px;font-size:15px">${esc(title)}</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${body}</table>`
}

export function digestEmail(o: Overview, appUrl: string, now = Date.now()): { subject: string; html: string; sections: DigestSections } {
  const sections = digestSections(o, now)
  const p = o.platform
  const n = sections.attention.length
  const subject = n > 0
    ? `PharmaTrack weekly: ${n} pharmac${n === 1 ? "y needs" : "ies need"} a call`
    : "PharmaTrack weekly: all pharmacies active"

  const tiles = [
    ["Active this week", `${p.active7} of ${p.tenants}`],
    ["Sales through PharmaTrack (30 days)", kes(p.revenue30)],
    ["Their profit (30 days)", kes(p.profit30)],
    ["Monthly subscriptions", kes(p.mrr)],
  ].map(([k, v]) => `<td style="padding:10px;border:1px solid #e5e7eb;border-radius:8px;vertical-align:top">
      <div style="color:#6b7280;font-size:12px">${esc(k!)}</div><div style="font-weight:700;font-size:16px;margin-top:2px">${esc(v!)}</div></td>`).join("")

  const ago = (t: TenantOverview) => (t.lastActiveAt ? `last active ${Math.floor((now - t.lastActiveAt) / DAY)} d ago` : "never active")
  const shortDate = (ms: number) => new Date(ms).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short" })
  const parts = [
    `<table style="width:100%;border-collapse:separate;border-spacing:6px"><tr>${tiles}</tr></table>`,
    n > 0
      ? table(`Call these ${n} pharmac${n === 1 ? "y" : "ies"}`, sections.attention.slice(0, 25).map((t) => row(t, appUrl, `${t.health.label} · ${ago(t)}`)).join(""))
      : `<p style="margin-top:20px">Every pharmacy used PharmaTrack recently — nothing to chase this week.</p>`,
    sections.trialsEnding.length
      ? table("Trials ending this week", sections.trialsEnding.map((t) => row(t, appUrl, `ends ${shortDate(t.renewsAt!)}`)).join(""))
      : "",
    sections.followUps.length
      ? table("Follow-ups you planned", sections.followUps.map((t) => row(t, appUrl, `follow up ${t.followUpOn}`)).join(""))
      : "",
  ]

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:640px;color:#111827">
      <h2 style="margin:0 0 4px">Your week on PharmaTrack</h2>
      <p style="margin:0 0 12px;color:#6b7280">${p.tenants} pharmacies · ${p.newSignups30} new in the last 30 days · ${kes(p.collected30)} collected</p>
      ${parts.join("")}
      <p style="margin:28px 0">
        <a href="${appUrl}/platform" style="background:#15803d;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Open the platform console</a>
      </p>
      <p style="color:#9ca3af;font-size:12px">Sent every Monday morning. Health: inactive = no use for 14+ days, at risk = 8–14, slipping = 4–7 days or sales halved.</p>
    </div>`
  return { subject, html, sections }
}
