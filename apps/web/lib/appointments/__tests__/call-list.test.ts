import { describe, expect, it } from "vitest"
import { callWindow, digestRecipients, nairobiHour, nairobiYmd, staffDigestEmail, type CallItem, type Manager } from "../call-list"

const item = (over: Partial<CallItem>): CallItem => ({
  id: "a1", organizationId: "org1", branchId: "b1", scheduledAt: new Date("2026-10-16T07:00:00Z"),
  customerName: "Jane Wanjiku", customerPhone: "+254700000001", service: "consultation", branchName: "Main", assignedTo: null,
  ...over,
})

describe("callWindow", () => {
  it("uses Nairobi days, not UTC", () => {
    // 22:30 UTC on the 15th is 01:30 on the 16th in Nairobi.
    const w = callWindow(new Date("2026-10-15T22:30:00Z"))
    expect(w.today).toBe("2026-10-16")
    expect(w.tomorrow).toBe("2026-10-17")
    expect(w.start.toISOString()).toBe("2026-10-15T21:00:00.000Z")
    expect(w.end.toISOString()).toBe("2026-10-17T21:00:00.000Z")
  })

  it("reports the Nairobi hour and date", () => {
    expect(nairobiHour(new Date("2026-10-16T03:00:00Z"))).toBe(6)
    expect(nairobiYmd(new Date("2026-10-16T20:59:00Z"))).toBe("2026-10-16")
    expect(nairobiYmd(new Date("2026-10-16T21:00:00Z"))).toBe("2026-10-17")
  })
})

describe("digestRecipients", () => {
  const managers: Manager[] = [
    { organizationId: "org1", userId: "owner", branchId: null },
    { organizationId: "org1", userId: "mgrB1", branchId: "b1" },
    { organizationId: "org1", userId: "mgrB2", branchId: "b2" },
    { organizationId: "org2", userId: "otherOwner", branchId: null },
  ]

  it("sends an assigned appointment only to the assigned staff member", () => {
    const g = digestRecipients([item({ assignedTo: "pharm1" })], managers)
    expect([...g.keys()]).toEqual(["org1:pharm1"])
  })

  it("sends an unassigned appointment to the owner and that branch's manager only", () => {
    const g = digestRecipients([item({ branchId: "b1" })], managers)
    expect([...g.keys()].sort()).toEqual(["org1:mgrB1", "org1:owner"])
  })

  it("never crosses pharmacies and sorts each list by time", () => {
    const g = digestRecipients([
      item({ id: "late", scheduledAt: new Date("2026-10-16T12:00:00Z") }),
      item({ id: "early", scheduledAt: new Date("2026-10-16T06:00:00Z") }),
    ], managers)
    expect(g.has("org2:otherOwner")).toBe(false)
    expect(g.get("org1:owner")!.map((i) => i.id)).toEqual(["early", "late"])
  })
})

describe("staffDigestEmail", () => {
  it("lists tomorrow's clients to call with tap-to-call numbers, escaped", () => {
    const { subject, html } = staffDigestEmail({
      recipientName: "Ann Mwangi", orgName: "Ops <Test> Pharmacy",
      today: [], tomorrow: [item({ customerName: "<script>x</script>" })], appUrl: "https://pharmatrack.co.ke",
    })
    expect(subject).toBe("1 client to call today — appointments tomorrow")
    expect(html).toContain('href="tel:+254700000001"')
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
    expect(html).toContain("Ops &lt;Test&gt; Pharmacy")
  })
})
