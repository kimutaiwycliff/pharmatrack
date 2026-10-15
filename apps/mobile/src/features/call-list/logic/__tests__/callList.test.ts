import { describe, expect, it } from "vitest"
import {
  actionToast, applyAction, callNotificationBody, callSections, doneLabel, hasRows, isDone, planCallNotification, rowSubtitle, telUrl,
  toCallCount, type CallList, type CallRow,
} from "../callList"

const row = (over: Partial<CallRow> = {}): CallRow => ({
  id: "a",
  scheduled_at: "2026-03-13T06:00:00Z",
  status: "scheduled",
  service_label: "Depo-Provera",
  customer: { full_name: "Mary W", phone: "+254712345678" },
  assigned: { id: "u1", name: "Jane" },
  branch_name: "Westlands",
  contact_outcome: null,
  contacted_at: null,
  ...over,
})

const list = (over: Partial<CallList> = {}): CallList => ({ today: [], tomorrow: [], sms_enabled: false, ...over })

describe("done state", () => {
  it("confirmed or called rows are done; no-answer rows are not", () => {
    expect(isDone(row({ status: "confirmed" }))).toBe(true)
    expect(isDone(row({ contact_outcome: "called" }))).toBe(true)
    expect(isDone(row({ contact_outcome: "no_answer" }))).toBe(false)
    expect(isDone(row())).toBe(false)
  })
  it("labels confirmed ahead of called", () => {
    expect(doneLabel(row({ status: "confirmed", contact_outcome: "called" }))).toBe("Confirmed")
    expect(doneLabel(row({ contact_outcome: "called" }))).toBe("Called")
    expect(doneLabel(row())).toBeNull()
  })
})

describe("toCallCount", () => {
  it("counts tomorrow's scheduled rows nobody has phoned (today's rows don't count)", () => {
    const l = list({
      tomorrow: [row({ id: "1" }), row({ id: "2", contact_outcome: "no_answer" }), row({ id: "3", status: "confirmed" }), row({ id: "4" })],
      today: [row({ id: "5" })],
    })
    expect(toCallCount(l)).toBe(2)
  })
})

describe("sections", () => {
  it("puts tomorrow first and drops empty sections", () => {
    expect(callSections(list({ today: [row()], tomorrow: [row({ id: "b" })] })).map((s) => s.title)).toEqual(["Tomorrow — call today", "Today"])
    expect(callSections(list({ today: [row()] })).map((s) => s.key)).toEqual(["today"])
  })
  it("hasRows", () => {
    expect(hasRows(undefined)).toBe(false)
    expect(hasRows(list())).toBe(false)
    expect(hasRows(list({ today: [row()] }))).toBe(true)
  })
})

describe("labels", () => {
  it("subtitle joins service, assignee and branch", () => {
    expect(rowSubtitle(row())).toBe("Depo-Provera · with Jane · Westlands")
    expect(rowSubtitle(row({ service_label: null, assigned: null, branch_name: null }))).toBe("unassigned")
    expect(rowSubtitle(row({ assigned: { id: "u", name: null } }))).toBe("Depo-Provera · unassigned · Westlands")
  })
  it("tel url keeps only digits and +", () => {
    expect(telUrl("+254 712-345 678")).toBe("tel:+254712345678")
  })
  it("toasts match web", () => {
    expect(actionToast("confirmed", "Mary W")).toBe("Mary W confirmed")
    expect(actionToast("called", "Mary W")).toBe("Marked as called")
    expect(actionToast("no_answer", "Mary W")).toBe("Marked as no answer — try again later")
  })
  it("notification body pluralises", () => {
    expect(callNotificationBody(1)).toBe("1 client to call today about tomorrow's appointments")
    expect(callNotificationBody(3)).toBe("3 clients to call today about tomorrow's appointments")
  })
})

describe("applyAction", () => {
  it("patches only the matching row", () => {
    const l = list({ tomorrow: [row({ id: "1" }), row({ id: "2" })], today: [row({ id: "3" })] })
    const called = applyAction(l, "1", "called", "2026-03-12T07:00:00.000Z")
    expect(called.tomorrow[0]).toMatchObject({ contact_outcome: "called", contacted_at: "2026-03-12T07:00:00.000Z" })
    expect(called.tomorrow[1]!.contact_outcome).toBeNull()
    const confirmed = applyAction(l, "3", "confirmed", "x")
    expect(confirmed.today[0]!.status).toBe("confirmed")
    expect(toCallCount(called)).toBe(1)
  })
})

describe("planCallNotification", () => {
  const l = list({ tomorrow: [row({ id: "1" }), row({ id: "2" }), row({ id: "3", contact_outcome: "called" })] })
  // 07:30 Nairobi on 12 Mar 2026 = 04:30Z.
  const at = Date.parse("2026-03-12T04:30:00Z")

  it("before 07:30 Nairobi: fires at 07:30 today with tomorrow's rows still to call", () => {
    expect(planCallNotification(l, Date.parse("2026-03-12T03:00:00Z"))).toEqual({ at, count: 2 })
  })
  it("just after Nairobi midnight (still the previous UTC day) targets the new Nairobi day", () => {
    // 21:30Z on the 11th = 00:30 on the 12th in Nairobi.
    expect(planCallNotification(l, Date.parse("2026-03-11T21:30:00Z"))).toEqual({ at, count: 2 })
  })
  it("at or after 07:30 Nairobi: tomorrow's 07:30, using the server's count for the day after", () => {
    expect(planCallNotification(l, at)).toBeNull() // server sent no next-day count
    const withNext = { ...l, next_day_to_call: 3 }
    expect(planCallNotification(withNext, at)).toEqual({ at: at + 86_400_000, count: 3 })
    expect(planCallNotification(withNext, Date.parse("2026-03-12T17:00:00Z"))).toEqual({ at: at + 86_400_000, count: 3 })
    expect(planCallNotification({ ...l, next_day_to_call: 0 }, Date.parse("2026-03-12T17:00:00Z"))).toBeNull()
  })
  it("nobody left to call: nothing", () => {
    expect(planCallNotification(list({ tomorrow: [row({ status: "confirmed" })] }), Date.parse("2026-03-12T03:00:00Z"))).toBeNull()
  })
})
