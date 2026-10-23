import { beforeAll, describe, expect, it } from "vitest"
import { apiLimitMessage, apiTierFor } from "../api-limits"
import { retryText, signInErrorMessage } from "../retry-text"

// The limiter's in-memory fallback (no Redis in unit tests).
delete process.env.REDIS_URL
let rl: typeof import("../rate-limit")
let lockout: typeof import("../auth/lockout")
beforeAll(async () => {
  rl = await import("../rate-limit")
  lockout = await import("../auth/lockout")
})

describe("apiTierFor", () => {
  it("leaves Better Auth and non-API paths alone", () => {
    expect(apiTierFor("/api/auth/sign-in/email")).toBeNull()
    expect(apiTierFor("/products")).toBeNull()
  })
  it("puts heavy work, callbacks and device sync on their own limits", () => {
    expect(apiTierFor("/api/products/export")?.name).toBe("heavy")
    expect(apiTierFor("/api/inventory/import")?.limit).toBe(30)
    expect(apiTierFor("/api/reports/stock-value")?.name).toBe("heavy")
    expect(apiTierFor("/api/mpesa/callback")?.name).toBe("callback")
    expect(apiTierFor("/api/mpesa/initiate")?.name).toBe("default")
    expect(apiTierFor("/api/sync/pull")?.name).toBe("sync")
    expect(apiTierFor("/api/products")).toMatchObject({ name: "default", limit: 300, windowSec: 60 })
  })
  it("says what to do", () => {
    expect(apiLimitMessage(apiTierFor("/api/products/export")!, "45 seconds")).toBe("Too many reports, imports and exports in a short time. Try again in 45 seconds.")
  })
})

describe("messages", () => {
  it("rounds the wait up to a readable unit", () => {
    expect(retryText(1)).toBe("1 second")
    expect(retryText(59)).toBe("59 seconds")
    expect(retryText(61)).toBe("2 minutes")
    expect(retryText(900)).toBe("15 minutes")
    expect(retryText(3601)).toBe("2 hours")
  })
  it("keeps the server's lockout text, explains per-device limits, else the fallback", () => {
    expect(signInErrorMessage(429, "Too many wrong PINs. This PIN is locked for 15 minutes — …", 900, "x")).toMatch(/^Too many wrong PINs/)
    expect(signInErrorMessage(429, "Too many requests. Please try again later.", 240, "x")).toBe("Too many sign-in attempts from this device. Try again in 4 minutes.")
    expect(signInErrorMessage(401, "Invalid email or password", 0, "x")).toBe("Invalid email or password")
    expect(signInErrorMessage(401, undefined, 0, "Invalid phone or PIN")).toBe("Invalid phone or PIN")
  })
})

describe("limits and lockouts (in-memory)", () => {
  it("counts hits in a window", async () => {
    const key = `t:${Math.random()}`
    expect((await rl.rateLimit(key, 2, 60)).ok).toBe(true)
    expect((await rl.rateLimit(key, 2, 60)).ok).toBe(true)
    const third = await rl.rateLimit(key, 2, 60)
    expect(third.ok).toBe(false)
    expect(third.retryAfter).toBeGreaterThan(0)
  })
  it("locks a PIN after 5 failures from anywhere, and a success clears the count", async () => {
    const phone = `+2547${Math.floor(Math.random() * 1e8)}`
    for (let i = 0; i < 4; i++) expect(await lockout.failedAttempt("pin", phone)).toBe(0)
    await lockout.succeeded("pin", phone)
    for (let i = 0; i < 4; i++) expect(await lockout.failedAttempt("pin", phone)).toBe(0)
    expect(await lockout.failedAttempt("pin", phone)).toBe(900)
    await expect(lockout.assertNotLocked("pin", phone)).rejects.toMatchObject({ statusCode: 429 })
    expect(await rl.lockRemaining("pin", phone)).toBeGreaterThan(890)
  })
  it("words the lockouts", () => {
    expect(lockout.lockedMessage("pin", 900)).toBe("Too many wrong PINs. This PIN is locked for 15 minutes — sign in with your email and password, or ask your manager.")
    expect(lockout.lockedMessage("password", 600)).toBe("Too many failed sign-in attempts for this account. Try again in 10 minutes, or reset your password.")
  })
  it("returns one 429 shape with Retry-After", async () => {
    const res = rl.tooManyRequests("Slow down", 42.2)
    expect(res.status).toBe(429)
    expect(res.headers.get("retry-after")).toBe("43")
    expect(await res.json()).toEqual({ error: "Slow down", message: "Slow down", retry_after: 43 })
  })
  it("gives Better Auth an atomic consume", async () => {
    const key = `1.2.3.4|/sign-in/email|${Math.random()}`
    expect(await rl.authRateLimitStorage.consume(key, { window: 300, max: 1 })).toEqual({ allowed: true, retryAfter: null })
    const second = await rl.authRateLimitStorage.consume(key, { window: 300, max: 1 })
    expect(second.allowed).toBe(false)
    expect(second.retryAfter).toBeGreaterThan(0)
  })
})
