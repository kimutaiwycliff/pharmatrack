import { describe, it, expect } from "vitest"
import { z } from "zod"
import { zUuid } from "@/lib/api/validation"

// Mirrors the UUID-bearing fields of the /api/sales schema, using the REAL
// zUuid validator the route now uses. Regression for the "Invalid UUID
// (field: branch_id)" failure: seed branches/orgs use non-RFC UUIDs (version
// nibble 0) that Postgres stores but Zod's strict z.uuid() rejected.
const saleUuids = z.object({
  branch_id: zUuid(),
  shift_id: zUuid().nullable(),
  product_id: zUuid(),
})

describe("zUuid", () => {
  it("accepts the exact payload that was failing (seed branch UUID)", () => {
    const r = saleUuids.safeParse({
      branch_id: "b1b2c3d4-0002-0002-0002-000000000001", // seed branch (version 0)
      shift_id: "0c55331f-20ec-495c-916f-b86e9ce5ec29", // real gen_random_uuid
      product_id: "836f7b92-f9b7-4e31-b504-28eefbfb4285", // real gen_random_uuid
    })
    expect(r.success).toBe(true)
  })

  it("accepts seed org/branch UUIDs (non-RFC version/variant)", () => {
    for (const id of [
      "a1b2c3d4-0001-0001-0001-000000000001",
      "b1b2c3d4-0002-0002-0002-000000000002",
      "219445e4-2b57-4e2b-8266-159f439a4d3e",
    ]) {
      expect(zUuid().safeParse(id).success).toBe(true)
    }
  })

  it("still rejects empty strings and garbage", () => {
    for (const bad of ["", "not-a-uuid", "b1b2c3d4-0002-0002-0002", "  ", "0".repeat(32)]) {
      expect(zUuid().safeParse(bad).success).toBe(false)
    }
  })

  it("rejects a null branch_id but allows null shift_id", () => {
    expect(
      saleUuids.safeParse({
        branch_id: null,
        shift_id: null,
        product_id: "836f7b92-f9b7-4e31-b504-28eefbfb4285",
      }).success,
    ).toBe(false)
  })
})
