import { describe, expect, it } from "vitest"
import { resolvePermissions } from "@pharmatrack/core"
import { effectivePermissions, homeTab, visibleMenuItems, visibleTabs, type NavContext } from "../visibility"

const ctx = (role: string, extra: Partial<NavContext> = {}): NavContext => ({
  permissions: resolvePermissions(role),
  planCode: "enterprise",
  offline: false,
  ...extra,
})

const hrefs = (c: NavContext) => visibleMenuItems(c).map((m) => m.href)

describe("visibleTabs", () => {
  it("never shows a cashier the dashboard (revenue) or inventory", () => {
    const tabs = visibleTabs(ctx("cashier"))
    expect(tabs).toEqual(["pos", "shifts", "more"])
  })

  it("gives an owner every tab", () => {
    expect(visibleTabs(ctx("owner"))).toEqual(["pos", "dashboard", "inventory", "shifts", "appointments", "more"])
  })

  it("hides plan-gated tabs the org's plan doesn't include", () => {
    // starter has no appointments/dashboard? — whatever it lacks must disappear.
    const starter = visibleTabs(ctx("owner", { planCode: "starter" }))
    const enterprise = visibleTabs(ctx("owner"))
    expect(starter.every((t) => enterprise.includes(t))).toBe(true)
    expect(starter).toContain("more")
  })

  it("follows org overrides, not the role name", () => {
    const perms = ["pos.sell", "dashboard.view"]
    expect(visibleTabs({ permissions: perms, planCode: "enterprise", offline: false })).toEqual(["pos", "dashboard", "shifts", "more"])
  })

  it("shows the Shift tab to a shift reviewer who can't sell", () => {
    expect(visibleTabs({ permissions: ["shifts.view_all"], planCode: "enterprise", offline: false })).toEqual(["shifts", "more"])
  })
})

describe("visibleMenuItems", () => {
  it("cashier sees only sales history, sync and settings", () => {
    expect(hrefs(ctx("cashier"))).toEqual(["/sales", "/sync", "/settings"])
  })

  it("purchase orders show for receive-only staff (pharmacist) and managers", () => {
    expect(hrefs(ctx("pharmacist"))).toContain("/purchase-orders")
    expect(hrefs(ctx("manager"))).toContain("/purchase-orders")
    expect(hrefs({ permissions: ["purchasing.receive"], planCode: "enterprise", offline: false })).toContain("/purchase-orders")
  })

  it("owner-only items stay owner-only by default", () => {
    expect(hrefs(ctx("owner"))).toContain("/billing")
    expect(hrefs(ctx("manager"))).not.toContain("/billing")
    expect(hrefs(ctx("manager"))).toContain("/sync-issues")
    expect(hrefs(ctx("pharmacist"))).not.toContain("/sync-issues")
  })

  it("drops online-only screens in the Offline Edition", () => {
    const off = hrefs(ctx("owner", { offline: true }))
    for (const h of ["/purchase-orders", "/sync-issues", "/sync", "/billing", "/shift-history"]) expect(off).not.toContain(h)
    expect(off).toContain("/products")
    expect(off).toContain("/settings")
  })
})

describe("homeTab", () => {
  it("lands sellers on the POS and non-sellers on their first back-office tab", () => {
    expect(homeTab(ctx("cashier"))).toBe("pos")
    expect(homeTab({ permissions: ["dashboard.view"], planCode: "enterprise", offline: false })).toBe("dashboard")
    expect(homeTab({ permissions: [], planCode: "enterprise", offline: false })).toBe("more")
  })
})

describe("effectivePermissions", () => {
  it("prefers the selected staff member's roster permissions", () => {
    expect(effectivePermissions({ staffPermissions: ["pos.sell"], sessionPermissions: ["reports.view"], role: "owner" })).toEqual(["pos.sell"])
  })

  it("falls back to the session, then to role defaults", () => {
    expect(effectivePermissions({ staffPermissions: [], sessionPermissions: ["reports.view"], role: "owner" })).toEqual(["reports.view"])
    expect(effectivePermissions({ role: "cashier" })).toEqual(resolvePermissions("cashier"))
    expect(effectivePermissions({})).toEqual([])
  })
})
