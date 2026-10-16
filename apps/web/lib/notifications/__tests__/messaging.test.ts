import { afterEach, describe, expect, it, vi } from "vitest"
import { messagingFor } from "../messaging"

vi.mock("@pharmatrack/db", () => ({ dbAdmin: vi.fn(), org_settings: {} }))

describe("messagingFor", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("is off until the pharmacy has paid, even with the platform keys set", () => {
    vi.stubEnv("AT_USERNAME", "u")
    vi.stubEnv("AT_API_KEY", "k")
    expect(messagingFor({})).toEqual({ sms: false, whatsapp: false })
    expect(messagingFor(null).sms).toBe(false)
    expect(messagingFor({ sms_enabled: "true" }).sms).toBe(false) // only a real boolean counts
    expect(messagingFor({ sms_enabled: true }).sms).toBe(true)
  })

  it("is off when the platform has no Africa's Talking keys, even if switched on", () => {
    vi.stubEnv("AT_USERNAME", "")
    vi.stubEnv("AT_API_KEY", "")
    expect(messagingFor({ sms_enabled: true }).sms).toBe(false)
  })
})
