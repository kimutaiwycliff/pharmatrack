import { describe, expect, it } from "vitest"
import { reducePushResults, type OutboxRef, type PushResult } from "../push-result"

const batch: OutboxRef[] = [
  { seq: 1, client_id: "a" },
  { seq: 2, client_id: "b" },
  { seq: 3, client_id: "c" },
  { seq: 4, client_id: "d" },
]

describe("reducePushResults", () => {
  it("marks synced and duplicate as done, rejected as needs-attention", () => {
    const results: PushResult[] = [
      { client_id: "a", status: "synced", server_id: "s1", flags: ["late_sync"] },
      { client_id: "b", status: "duplicate", server_id: null },
      { client_id: "c", status: "rejected", code: "cashier_invalid", message: "nope" },
      { client_id: "d", status: "synced", server_id: "s4" },
    ]
    const o = reducePushResults(batch, results)
    expect(o.synced.map((s) => s.seq)).toEqual([1, 2, 4])
    expect(o.synced[0]!.flags).toEqual(["late_sync"])
    expect(o.rejected).toEqual([{ seq: 3, code: "cashier_invalid", message: "nope" }])
    expect(o.stoppedAt).toBeNull()
  })

  it("stops at the first retry but keeps definitive answers after it", () => {
    const results: PushResult[] = [
      { client_id: "a", status: "synced", server_id: "s1" },
      { client_id: "b", status: "retry", code: "shift_unknown", message: "later" },
      { client_id: "c", status: "retry", code: "server_error", message: "later" },
      { client_id: "d", status: "duplicate", server_id: "s4" },
    ]
    const o = reducePushResults(batch, results)
    expect(o.stoppedAt).toEqual({ seq: 2, code: "shift_unknown", message: "later" })
    expect(o.retryCount).toBe(2)
    expect(o.synced.map((s) => s.seq)).toEqual([1, 4])
  })

  it("treats a missing answer as retry", () => {
    const o = reducePushResults(batch, [{ client_id: "a", status: "synced", server_id: "s1" }])
    expect(o.stoppedAt?.seq).toBe(2)
    expect(o.retryCount).toBe(3)
  })

  it("matches by client_id when the order differs", () => {
    const results: PushResult[] = [
      { client_id: "b", status: "synced", server_id: "s2" },
      { client_id: "a", status: "rejected", code: "invalid", message: "bad" },
      { client_id: "c", status: "synced", server_id: "s3" },
      { client_id: "d", status: "synced", server_id: "s4" },
    ]
    const o = reducePushResults(batch, results)
    expect(o.rejected[0]!.seq).toBe(1)
    expect(o.synced.map((s) => s.seq)).toEqual([2, 3, 4])
  })
})
