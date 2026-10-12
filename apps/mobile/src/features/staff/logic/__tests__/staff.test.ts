import { describe, expect, it } from "vitest"
import {
  branchLabel, canManageStaff, filterStaff, roleLabel, staffBadge, staffPinError, validateInvite, type StaffMember,
} from "../staff"

const member = (over: Partial<StaffMember> = {}): StaffMember => ({
  id: "u1",
  full_name: "Jane Wanjiku",
  role: "cashier",
  branch_id: "b1",
  phone: "+254712345678",
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  branch_name: "Westlands",
  banned: false,
  ban_reason: null,
  branches: { name: "Westlands" },
  ...over,
})

describe("roleLabel / branchLabel", () => {
  it("labels roles", () => {
    expect(roleLabel("pharmacist")).toBe("Pharmacist")
    expect(roleLabel("auditor")).toBe("Auditor")
    expect(roleLabel(null)).toBe("")
  })
  it("falls back from branch_name to the relation to 'No branch'", () => {
    expect(branchLabel({ branch_name: null, branches: { name: "CBD" } })).toBe("CBD")
    expect(branchLabel({ branch_name: null, branches: null })).toBe("No branch")
  })
})

describe("staffBadge", () => {
  it("distinguishes suspended, banned, inactive and active", () => {
    expect(staffBadge(member({ banned: true, ban_reason: "suspended" })).label).toBe("Suspended")
    expect(staffBadge(member({ banned: true, ban_reason: "banned" })).label).toBe("Banned")
    expect(staffBadge(member({ is_active: false })).label).toBe("Inactive")
    // Offline Edition rows: banned mirrors !is_active with no reason.
    expect(staffBadge(member({ is_active: false, banned: true, ban_reason: null })).label).toBe("Inactive")
    expect(staffBadge(member()).tone).toBe("ok")
  })
})

describe("canManageStaff", () => {
  it("mirrors the server's PATCH/DELETE rule", () => {
    expect(canManageStaff("owner", member({ role: "manager" }))).toBe(true)
    expect(canManageStaff("manager", member({ role: "cashier" }))).toBe(true)
    expect(canManageStaff("manager", member({ role: "manager" }))).toBe(false)
    expect(canManageStaff("manager", member({ role: "owner" }))).toBe(false)
    expect(canManageStaff("pharmacist", member())).toBe(false)
  })
  it("never lets you edit yourself here", () => {
    expect(canManageStaff("owner", member({ id: "me" }), "me")).toBe(false)
  })
})

describe("filterStaff", () => {
  const list = [
    member({ id: "1", full_name: "Jane Wanjiku" }),
    member({ id: "2", full_name: "Otieno Ouma", role: "pharmacist", phone: "+254700111222", branch_name: "CBD" }),
    member({ id: "3", full_name: "Mary Akinyi", is_active: false }),
  ]
  it("searches name, role, branch and phone (local format)", () => {
    expect(filterStaff(list, "otieno", "all").map((m) => m.id)).toEqual(["2"])
    expect(filterStaff(list, "pharmacist", "all").map((m) => m.id)).toEqual(["2"])
    expect(filterStaff(list, "cbd", "all").map((m) => m.id)).toEqual(["2"])
    expect(filterStaff(list, "0700 111", "all").map((m) => m.id)).toEqual(["2"])
  })
  it("filters by status", () => {
    expect(filterStaff(list, "", "active").map((m) => m.id)).toEqual(["1", "2"])
    expect(filterStaff(list, "", "inactive").map((m) => m.id)).toEqual(["3"])
  })
})

describe("validateInvite", () => {
  it("online: needs a name and a valid email; phone optional but must be valid", () => {
    expect(validateInvite({ name: "J", email: "x", phone: "", pin: "" }, { offline: false })).toEqual({
      name: "Enter the staff member's full name",
      email: "Enter a valid email address",
    })
    expect(validateInvite({ name: "Jane", email: "jane@example.com", phone: "12", pin: "" }, { offline: false }).phone).toBeTruthy()
    expect(validateInvite({ name: "Jane", email: "jane@example.com", phone: "0712345678", pin: "" }, { offline: false })).toEqual({})
  })
  it("offline: phone + 4-8 digit PIN are required, email is not", () => {
    expect(validateInvite({ name: "Jane", email: "", phone: "", pin: "12" }, { offline: true })).toEqual({
      phone: "Enter a phone number (used to sign in)",
      pin: "PIN must be 4-8 digits",
    })
    expect(validateInvite({ name: "Jane", email: "", phone: "712345678", pin: "123456" }, { offline: true })).toEqual({})
  })
})

describe("staffPinError", () => {
  it("requires exactly 4 digits; online also rejects trivial PINs", () => {
    expect(staffPinError("123", { offline: false })).toBe("PIN must be exactly 4 digits")
    expect(staffPinError("1111", { offline: false })).toBe("Choose a less predictable PIN")
    expect(staffPinError("1111", { offline: true })).toBeNull()
    expect(staffPinError("4821", { offline: false })).toBeNull()
  })
})
