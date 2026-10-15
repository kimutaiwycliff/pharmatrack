import { describe, expect, it } from "vitest"
import { checkPinChange, CURRENT_PIN_REQUIRED, CURRENT_PIN_WRONG, RECENT_SIGN_IN_MS } from "../pin-change"

const now = new Date("2026-10-15T10:00:00Z")
const verify = async (pin: string, hash: string) => hash === `hash:${pin}`
const ago = (ms: number) => new Date(now.getTime() - ms)

describe("checkPinChange", () => {
  it("lets anyone signed in set a first PIN — no password needed", async () => {
    expect(await checkPinChange({ existingHash: null, sessionCreatedAt: ago(30 * 86_400_000), now, verify })).toEqual({ ok: true })
  })

  it("allows changing a PIN with the correct current PIN", async () => {
    expect(await checkPinChange({ existingHash: "hash:1234", currentPin: "1234", sessionCreatedAt: ago(86_400_000), now, verify })).toEqual({ ok: true })
  })

  it("rejects a wrong current PIN even right after sign-in", async () => {
    expect(await checkPinChange({ existingHash: "hash:1234", currentPin: "9999", sessionCreatedAt: ago(1000), now, verify })).toEqual({
      ok: false,
      error: CURRENT_PIN_WRONG,
    })
  })

  it("allows a forgotten PIN to be replaced after a fresh sign-in", async () => {
    expect(await checkPinChange({ existingHash: "hash:1234", sessionCreatedAt: ago(RECENT_SIGN_IN_MS - 1000), now, verify })).toEqual({ ok: true })
  })

  it("asks for the current PIN when the sign-in is old", async () => {
    expect(await checkPinChange({ existingHash: "hash:1234", sessionCreatedAt: ago(RECENT_SIGN_IN_MS + 1000), now, verify })).toEqual({
      ok: false,
      error: CURRENT_PIN_REQUIRED,
    })
    expect(await checkPinChange({ existingHash: "hash:1234", sessionCreatedAt: null, now, verify })).toEqual({ ok: false, error: CURRENT_PIN_REQUIRED })
  })
})
