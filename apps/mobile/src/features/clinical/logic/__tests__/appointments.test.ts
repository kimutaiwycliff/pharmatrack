import { describe, expect, it } from "vitest"
import {
  availableActions, defaultBookingTime, groupByNairobiDay, hasErrors, nextDoseDate, rangeBounds, recurrenceHint, statusBadge,
  validateBooking, type BookingInput,
} from "../appointments"

// 2026-03-12 10:00 in Nairobi (07:00Z), a Thursday.
const NOW = new Date("2026-03-12T07:00:00Z")

describe("rangeBounds", () => {
  it("today spans the Nairobi calendar day", () => {
    expect(rangeBounds("today", NOW)).toEqual({ from: "2026-03-11T21:00:00.000Z", to: "2026-03-12T20:59:59.999Z" })
  })
  it("upcoming starts at Nairobi midnight tomorrow, past ends at midnight today", () => {
    expect(rangeBounds("upcoming", NOW)).toEqual({ from: "2026-03-12T21:00:00.000Z" })
    expect(rangeBounds("past", NOW)).toEqual({ to: "2026-03-11T21:00:00.000Z" })
  })
  it("uses Nairobi's day, not UTC's, just after Nairobi midnight", () => {
    // 22:30Z on the 12th is 01:30 on the 13th in Nairobi.
    expect(rangeBounds("today", new Date("2026-03-12T22:30:00Z")).from).toBe("2026-03-12T21:00:00.000Z")
  })
})

describe("groupByNairobiDay", () => {
  const appts = [
    { id: "b", scheduled_at: "2026-03-13T06:00:00Z" },
    { id: "a", scheduled_at: "2026-03-12T08:00:00Z" },
    // 22:00Z on the 12th = 01:00 on the 13th in Nairobi → Tomorrow, not Today.
    { id: "c", scheduled_at: "2026-03-12T22:00:00Z" },
    { id: "d", scheduled_at: "2026-03-16T09:00:00Z" },
  ]

  it("sorts ascending and inserts a header per Nairobi day with counts", () => {
    const rows = groupByNairobiDay(appts, { now: NOW })
    expect(rows.map((r) => (r.kind === "header" ? `[${r.day}:${r.count}]` : r.item.id))).toEqual([
      "[2026-03-12:1]", "a", "[2026-03-13:2]", "c", "b", "[2026-03-16:1]", "d",
    ])
    const labels = rows.flatMap((r) => (r.kind === "header" ? [r.label] : []))
    expect(labels[0]).toBe("Today")
    expect(labels[1]).toBe("Tomorrow")
    expect(labels[2]).toMatch(/Mon/)
  })

  it("newestFirst reverses (Past tab)", () => {
    const rows = groupByNairobiDay(appts, { newestFirst: true, now: NOW })
    expect(rows.filter((r) => r.kind === "item").map((r) => (r.kind === "item" ? r.item.id : ""))).toEqual(["d", "b", "c", "a"])
  })

  it("returns nothing for no appointments", () => {
    expect(groupByNairobiDay([])).toEqual([])
  })
})

describe("statusBadge / availableActions", () => {
  it("maps statuses to badge colours", () => {
    expect(statusBadge("cancelled")).toEqual({ status: "danger", label: "Cancelled" })
    expect(statusBadge("no_show").status).toBe("warning")
    expect(statusBadge("confirmed").status).toBe("ok")
    expect(statusBadge("weird").label).toBe("Scheduled")
  })
  it("offers confirm only while scheduled and nothing once terminal", () => {
    expect(availableActions("scheduled")).toEqual(["confirm", "complete", "reschedule", "no_show", "cancel"])
    expect(availableActions("confirmed")).not.toContain("confirm")
    expect(availableActions("completed")).toEqual([])
    expect(availableActions("cancelled")).toEqual([])
  })
})

describe("nextDoseDate / recurrenceHint", () => {
  it("adds whole weeks (Depo-Provera at 12 weeks)", () => {
    expect(nextDoseDate("2026-03-12T07:00:00Z", 12)?.toISOString()).toBe("2026-06-04T07:00:00.000Z")
  })
  it("is null for one-off services or bad input", () => {
    expect(nextDoseDate("2026-03-12T07:00:00Z", null)).toBeNull()
    expect(nextDoseDate("2026-03-12T07:00:00Z", 0)).toBeNull()
    expect(nextDoseDate("nope", 4)).toBeNull()
  })
  it("describes the recurrence", () => {
    expect(recurrenceHint(13)).toBe("Repeats every 13 weeks")
    expect(recurrenceHint(1)).toBe("Repeats every week")
    expect(recurrenceHint(null)).toBeNull()
  })
  it("defaults bookings to the next whole hour", () => {
    const d = defaultBookingTime(new Date(2026, 2, 12, 10, 25))
    expect([d.getHours(), d.getMinutes()]).toEqual([11, 0])
  })
})

describe("validateBooking", () => {
  const ok: BookingInput = {
    customerName: "Jane Wanjiku", phone: "0712 345 678", email: "", serviceSlug: "depo", scheduledAt: NOW, duration: "15", notes: "",
  }
  it("accepts a complete booking", () => {
    expect(hasErrors(validateBooking(ok))).toBe(false)
  })
  it("flags each missing or bad field", () => {
    const e = validateBooking({ ...ok, customerName: " ", phone: "12", email: "x@", serviceSlug: null, scheduledAt: null, duration: "2" })
    expect(Object.keys(e).sort()).toEqual(["customerName", "duration", "email", "phone", "scheduledAt", "service"])
  })
  it("skips customer fields when editing", () => {
    expect(hasErrors(validateBooking({ ...ok, customerName: "", phone: "x", editing: true }))).toBe(false)
  })
})
