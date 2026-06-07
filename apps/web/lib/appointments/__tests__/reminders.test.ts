import { describe, it, expect } from "vitest"
import { buildReminders, customerSms } from "../reminders"

const base = {
  appointmentId: "a1",
  organizationId: "o1",
  customer: { phone: "0712345678", email: "jane@example.com" },
  pharmacistPhone: "0700000000",
}

function future(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString()
}

describe("buildReminders", () => {
  it("queues SMS+email for the customer and SMS for the pharmacist", () => {
    const rows = buildReminders({ ...base, scheduledAt: future(5) })
    const kinds = rows.map((r) => `${r.recipient}:${r.channel}`).sort()
    expect(kinds).toEqual(["customer:email", "customer:sms", "pharmacist:sms"])
    expect(rows.every((r) => r.status === "pending")).toBe(true)
    // all reminders for one appointment share a single send time (daily cron)
    expect(new Set(rows.map((r) => r.send_at)).size).toBe(1)
  })

  it("sends before the appointment", () => {
    const when = future(5)
    const rows = buildReminders({ ...base, scheduledAt: when })
    expect(new Date(rows[0]!.send_at).getTime()).toBeLessThan(new Date(when).getTime())
  })

  it("creates nothing for a past appointment", () => {
    expect(buildReminders({ ...base, scheduledAt: future(-1) })).toEqual([])
  })

  it("skips channels with no contact details (opt-out / missing info)", () => {
    const rows = buildReminders({
      ...base,
      scheduledAt: future(3),
      customer: { phone: null, email: null },
      pharmacistPhone: null,
    })
    expect(rows).toEqual([])
  })

  it("only emails the customer when there's no phone", () => {
    const rows = buildReminders({
      ...base,
      scheduledAt: future(3),
      customer: { phone: null, email: "x@y.com" },
      pharmacistPhone: null,
    })
    expect(rows.map((r) => `${r.recipient}:${r.channel}`)).toEqual(["customer:email"])
  })
})

describe("customerSms", () => {
  it("includes the customer first name and service", () => {
    const msg = customerSms({
      customerName: "Jane Wanjiku",
      service: "Family Planning — Depo-Provera",
      scheduledAt: future(1),
      branchName: "Main Branch",
      orgName: "Acme Pharmacy",
    })
    expect(msg).toContain("Jane")
    expect(msg).toContain("Depo-Provera")
    expect(msg).toContain("Acme Pharmacy")
  })
})
