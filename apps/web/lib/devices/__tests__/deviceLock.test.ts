import { describe, expect, it } from "vitest"
import {
  approvedUntil, canApproveDevices, compareVersions, deviceUseOf, permissionsOnDevice, deviceLockApplies, deviceLockFrom, deviceNameFromUserAgent, formatPairingCode, lockedRoles,
} from "@pharmatrack/core"
import { deviceCookie, deviceTokenFrom, DEVICE_COOKIE, DEVICE_HEADER } from "@/lib/devices/lock"

describe("deviceLockFrom", () => {
  it("is off for pharmacies that never set it", () => {
    expect(deviceLockFrom({})).toEqual({ enabled: false, managers_exempt: false, approvers: "owner" })
    expect(deviceLockFrom(null)).toEqual({ enabled: false, managers_exempt: false, approvers: "owner" })
    expect(deviceLockFrom({ receipt: { show_branch: true } })).toEqual({ enabled: false, managers_exempt: false, approvers: "owner" })
  })
  it("only treats a real true as on", () => {
    expect(deviceLockFrom({ device_lock: { enabled: "yes", managers_exempt: 1 } })).toEqual({ enabled: false, managers_exempt: false, approvers: "owner" })
    expect(deviceLockFrom({ device_lock: { enabled: true, managers_exempt: true } })).toEqual({ enabled: true, managers_exempt: true, approvers: "owner" })
  })
})

describe("deviceLockApplies", () => {
  const on = { enabled: true, managers_exempt: false }
  it("never applies to the owner", () => {
    expect(deviceLockApplies(on, "owner")).toBe(false)
    expect(deviceLockApplies({ enabled: true, managers_exempt: true }, "owner")).toBe(false)
  })
  it("applies to every other role when on", () => {
    for (const r of ["manager", "pharmacist", "cashier"]) expect(deviceLockApplies(on, r)).toBe(true)
  })
  it("frees managers only when the box is ticked", () => {
    expect(deviceLockApplies({ enabled: true, managers_exempt: true }, "manager")).toBe(false)
    expect(deviceLockApplies({ enabled: true, managers_exempt: true }, "cashier")).toBe(true)
  })
  it("does nothing when off or for people without a role", () => {
    expect(deviceLockApplies({ enabled: false, managers_exempt: false }, "cashier")).toBe(false)
    expect(deviceLockApplies(on, null)).toBe(false)
  })
  it("lists the roles it covers", () => {
    expect(lockedRoles(on)).toEqual(["manager", "pharmacist", "cashier"])
    expect(lockedRoles({ enabled: false, managers_exempt: true })).toEqual(["pharmacist", "cashier"])
  })
})

describe("device key on a request", () => {
  it("reads the Android header first, then the browser cookie", () => {
    expect(deviceTokenFrom(new Headers({ [DEVICE_HEADER]: "ptd_header", cookie: `${DEVICE_COOKIE}=ptd_cookie` }))).toBe("ptd_header")
    expect(deviceTokenFrom(new Headers({ cookie: `a=1; ${DEVICE_COOKIE}=ptd_cookie; b=2` }))).toBe("ptd_cookie")
    expect(deviceTokenFrom(new Headers({ cookie: "better-auth.session_token=x" }))).toBeNull()
    expect(deviceTokenFrom(null)).toBeNull()
  })
  it("stores the key as an httpOnly, long-lived cookie", () => {
    const c = deviceCookie("ptd_abc")
    expect(c).toContain(`${DEVICE_COOKIE}=ptd_abc`)
    expect(c).toContain("HttpOnly")
    expect(c).toContain("SameSite=Lax")
    expect(c).toMatch(/Max-Age=\d{8,}/)
  })
})

describe("display helpers", () => {
  it("splits the pairing code for reading aloud", () => {
    expect(formatPairingCode("482913")).toBe("482 913")
    expect(formatPairingCode("12")).toBe("12")
  })
  it("names a device from its browser", () => {
    expect(deviceNameFromUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36")).toBe("Chrome on Windows")
    expect(deviceNameFromUserAgent("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0")).toBe("Edge on Windows")
    expect(deviceNameFromUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15")).toBe("Safari on Mac")
    expect(deviceNameFromUserAgent("okhttp/4.12", "android")).toBe("Android phone")
    expect(deviceNameFromUserAgent(null)).toBe("This device")
  })
  it("compares app versions numerically", () => {
    expect(compareVersions("1.3.0", "1.4.0")).toBe(-1)
    expect(compareVersions("1.10.0", "1.9.9")).toBe(1)
    expect(compareVersions("1.4.0", "1.4")).toBe(0)
  })
})

describe("who can approve a device", () => {
  it("is the owner only, unless the pharmacy lets managers approve", () => {
    expect(deviceLockFrom({ device_lock: { enabled: true, approvers: "owner_managers" } }).approvers).toBe("owner_managers")
    expect(deviceLockFrom({ device_lock: { enabled: true, approvers: "anyone" } }).approvers).toBe("owner")
    expect(canApproveDevices({ approvers: "owner" }, "owner", [])).toBe(true)
    expect(canApproveDevices({ approvers: "owner" }, "manager", ["devices.manage"])).toBe(false)
    expect(canApproveDevices({ approvers: "owner_managers" }, "manager", ["devices.manage"])).toBe(true)
    expect(canApproveDevices({ approvers: "owner_managers" }, "manager", [])).toBe(false)
    expect(canApproveDevices({ approvers: "owner_managers" }, "cashier", ["devices.manage"])).toBe(true)
  })
})

describe("approvedUntil", () => {
  it("never ends for Always, a week for 7 days", () => {
    const now = new Date("2026-10-29T10:00:00Z")
    expect(approvedUntil("always", now)).toBeNull()
    expect(approvedUntil("week", now)!.toISOString()).toBe("2026-11-05T10:00:00.000Z")
  })
  it("ends 'Just today' at midnight in Nairobi", () => {
    expect(approvedUntil("today", new Date("2026-10-29T10:00:00Z"))!.toISOString()).toBe("2026-10-29T21:00:00.000Z")
    // 23:30 Nairobi (20:30 UTC) → that same midnight, half an hour later
    expect(approvedUntil("today", new Date("2026-10-29T20:30:00Z"))!.toISOString()).toBe("2026-10-29T21:00:00.000Z")
    // 00:30 Nairobi on the 30th (21:30 UTC on the 29th) → the next midnight
    expect(approvedUntil("today", new Date("2026-10-29T21:30:00Z"))!.toISOString()).toBe("2026-10-30T21:00:00.000Z")
  })
})

describe("what a device may be used for", () => {
  const pharmacist = ["products.view", "products.create", "stock.receive", "pos.sell", "pos.discount", "customers.manage", "reports.view", "shifts.view_all"]
  it("till only keeps selling, shifts and customers — no back office", () => {
    expect(permissionsOnDevice(pharmacist, "selling")).toEqual(["pos.sell", "pos.discount", "customers.manage", "shifts.view_all"])
  })
  it("back office keeps everything except selling", () => {
    expect(permissionsOnDevice(pharmacist, "back_office")).not.toContain("pos.sell")
    expect(permissionsOnDevice(pharmacist, "back_office")).toContain("reports.view")
  })
  it("everything changes nothing, and never adds what the role lacks", () => {
    expect(permissionsOnDevice(pharmacist, "all")).toEqual(pharmacist)
    expect(permissionsOnDevice(["pos.sell"], "back_office")).toEqual([])
  })
  it("reads a device's use from its purpose and access", () => {
    expect(deviceUseOf({ purpose: "till", access: "selling" })).toBe("till")
    expect(deviceUseOf({ purpose: "office", access: "all" })).toBe("office")
    expect(deviceUseOf({ purpose: "till", access: "all" })).toBe("all")
    expect(deviceUseOf({ purpose: "till" })).toBe("all")
  })
})
