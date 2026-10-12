import { describe, expect, it } from "vitest"
import { resolveBranchScope } from "../branch-scope"

const branches = [
  { id: "a", name: "Main" },
  { id: "b", name: "Annex" },
]

describe("resolveBranchScope", () => {
  it("pins staff without branches.all to their own branch", () => {
    expect(resolveBranchScope("all", { canSwitch: false, sessionBranchId: "a", branches })).toEqual({ branchId: "a", isAll: false })
  })

  it("honours 'all' and a chosen branch for branch-switchers", () => {
    expect(resolveBranchScope("all", { canSwitch: true, sessionBranchId: "a", branches })).toEqual({ branchId: undefined, isAll: true })
    expect(resolveBranchScope("b", { canSwitch: true, sessionBranchId: "a", branches })).toEqual({ branchId: "b", isAll: false })
  })

  it("falls back to the session branch when nothing (or a deleted branch) is stored", () => {
    expect(resolveBranchScope(null, { canSwitch: true, sessionBranchId: "a", branches })).toEqual({ branchId: "a", isAll: false })
    expect(resolveBranchScope("gone", { canSwitch: true, sessionBranchId: "a", branches })).toEqual({ branchId: "a", isAll: false })
  })
})
