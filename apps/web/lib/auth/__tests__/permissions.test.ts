import { describe, it, expect } from "vitest"
import {
  CAPABILITY_KEYS, resolvePermissions, toggleCapability, overridesFor, homeRouteFor, hasBackOfficeAccess,
  capabilityVisible, type Capability,
} from "@pharmatrack/core"

// What a tenant without any add-on can see and change.
const core = (caps: Capability[]) => caps.filter((c) => capabilityVisible(c, []))

describe("role permissions", () => {
  it("owner always has every capability, overrides ignored", () => {
    expect(resolvePermissions("owner", [{ role: "owner", capability: "reports.view", allowed: false }]))
      .toEqual(CAPABILITY_KEYS)
  })

  it("defaults reproduce the original hard-coded behaviour", () => {
    const cashier = resolvePermissions("cashier")
    expect(core(cashier)).toEqual(["pos.sell", "pos.discount"])
    expect(hasBackOfficeAccess(cashier)).toBe(false)
    expect(homeRouteFor(cashier)).toBe("/pos")

    const pharmacist = resolvePermissions("pharmacist")
    expect(pharmacist).toContain("stock.receive")
    expect(pharmacist).not.toContain("stock.adjust")
    expect(pharmacist).not.toContain("cost.view")
    expect(pharmacist).not.toContain("branches.all")

    const manager = resolvePermissions("manager")
    expect(manager).toContain("reports.view")
    expect(manager).toContain("branches.all")
    expect(manager).not.toContain("products.delete_permanent")
    expect(manager).not.toContain("billing.manage")
  })

  it("applies overrides for the matching role only and ignores unknown capabilities", () => {
    const overrides = [
      { role: "cashier", capability: "reports.view", allowed: true },
      { role: "cashier", capability: "pos.discount", allowed: false },
      { role: "manager", capability: "reports.view", allowed: false },
      { role: "cashier", capability: "made.up", allowed: true },
    ]
    const cashier = resolvePermissions("cashier", overrides)
    expect(cashier).toContain("reports.view")
    expect(cashier).not.toContain("pos.discount")
    expect(cashier).not.toContain("made.up")
    expect(resolvePermissions("unknown-role", overrides)).toEqual([])
  })

  it("turning a capability on also turns on what it requires", () => {
    const after = toggleCapability(resolvePermissions("cashier"), "purchasing.receive", true)
    expect(after).toEqual(expect.arrayContaining(["purchasing.receive", "stock.receive", "products.view"]))
  })

  it("turning a capability off also turns off everything that depends on it", () => {
    const after = toggleCapability(resolvePermissions("manager"), "products.view", false)
    for (const dependent of ["products.create", "stock.receive", "purchasing.receive", "purchasing.manage"] as const) {
      expect(after).not.toContain(dependent)
    }
    expect(after).toContain("reports.view")
  })

  it("stores only the minimal diff from defaults", () => {
    expect(overridesFor("pharmacist", resolvePermissions("pharmacist"))).toEqual([])
    const changed = toggleCapability(resolvePermissions("pharmacist"), "reports.view", true)
    expect(overridesFor("pharmacist", changed)).toEqual([{ capability: "reports.view", allowed: true }])
  })

  describe("add-on capabilities (ADR-021)", () => {
    it("are hidden without the add-on and shown with it", () => {
      expect(capabilityVisible("orders.collect", [])).toBe(false)
      expect(capabilityVisible("orders.send", [])).toBe(false)
      expect(capabilityVisible("orders.collect", ["cashier_station"])).toBe(true)
      expect(capabilityVisible("pos.sell", [])).toBe(true)
    })

    it("default to the cashier collecting and everyone sending", () => {
      expect(resolvePermissions("cashier")).toEqual(expect.arrayContaining(["orders.send", "orders.collect"]))
      expect(resolvePermissions("pharmacist")).toContain("orders.send")
      expect(resolvePermissions("pharmacist")).not.toContain("orders.collect")
      expect(resolvePermissions("manager")).toContain("orders.collect")
    })

    it("don't change where anyone lands or their back-office access", () => {
      for (const role of ["manager", "pharmacist", "cashier"] as const) {
        const all = resolvePermissions(role)
        expect(homeRouteFor(all)).toBe(homeRouteFor(core(all)))
        expect(hasBackOfficeAccess(all)).toBe(hasBackOfficeAccess(core(all)))
      }
    })

    it("go off with pos.sell, since they need it", () => {
      const after = toggleCapability(resolvePermissions("cashier"), "pos.sell", false)
      expect(after).not.toContain("orders.send")
      expect(after).not.toContain("orders.collect")
    })
  })
})
