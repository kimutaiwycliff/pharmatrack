import { describe, expect, it } from "vitest"
import { fnv1a, idempotencyKeyFor } from "@pharmatrack/core"
import { readIdempotencyKey } from "../idempotency"

const req = (key?: string) => new Request("http://x/api/batches", { method: "POST", headers: key === undefined ? {} : { "Idempotency-Key": key } })

describe("idempotencyKeyFor", () => {
  it("is stable for the same form contents", () => {
    expect(idempotencyKeyFor("nonce-1", { a: 1, b: "x" })).toBe(idempotencyKeyFor("nonce-1", { a: 1, b: "x" }))
  })

  it("changes when the contents or the form nonce change", () => {
    const base = idempotencyKeyFor("nonce-1", { qty: 10 })
    expect(idempotencyKeyFor("nonce-1", { qty: 11 })).not.toBe(base)
    expect(idempotencyKeyFor("nonce-2", { qty: 10 })).not.toBe(base)
  })

  it("always produces a key the server accepts", () => {
    for (const nonce of ["550e8400-e29b-41d4-a716-446655440000", "", "weird nonce/with*chars", "x".repeat(300)]) {
      const key = idempotencyKeyFor(nonce, { big: "y".repeat(5000) })
      expect(readIdempotencyKey(req(key))).toEqual({ key })
    }
  })

  it("hashes with FNV-1a", () => {
    expect(fnv1a("")).toBe("811c9dc5")
    expect(fnv1a("a")).toBe("e40c292c")
  })
})

describe("readIdempotencyKey", () => {
  it("treats a missing header as no key (older clients)", () => {
    expect(readIdempotencyKey(req())).toEqual({ key: null })
  })

  it("rejects malformed keys with a 400", async () => {
    for (const bad of ["short", "has space in it", "x".repeat(101)]) {
      const r = readIdempotencyKey(req(bad))
      expect("error" in r).toBe(true)
      if ("error" in r) expect(r.error.status).toBe(400)
    }
  })
})
