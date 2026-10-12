import { describe, expect, it } from "vitest"
import { createBurstDetector } from "../scanBurst"

/** Feed `chars` one per `gap` ms starting at `t`, appending to `base`. Returns [text, lastTime]. */
function type(d: ReturnType<typeof createBurstDetector>, base: string, chars: string, t: number, gap: number): [string, number] {
  let text = base
  let now = t
  for (const c of chars) {
    text += c
    d.change(text, now)
    now += gap
  }
  return [text, now - gap]
}

describe("scanner burst detection", () => {
  it("a fast burst ending in Enter is a scan", () => {
    const d = createBurstDetector()
    const [text, last] = type(d, "", "6164001234567", 1_000, 8)
    expect(d.submit(text, last + 10)).toEqual({ kind: "scan", code: "6164001234567", rest: "" })
  })

  it("restores what the cashier had typed before the burst", () => {
    const d = createBurstDetector()
    const [typed, t1] = type(d, "", "par", 0, 180) // human speed
    const [text, last] = type(d, typed, "12345678", t1 + 900, 6)
    expect(d.submit(text, last + 5)).toEqual({ kind: "scan", code: "12345678", rest: "par" })
  })

  it("human typing + Enter is a search", () => {
    const d = createBurstDetector()
    const [text, last] = type(d, "", "paracetamol", 0, 120)
    expect(d.submit(text, last + 200)).toEqual({ kind: "search", text: "paracetamol" })
  })

  it("a scanner batching several chars per change event still counts", () => {
    const d = createBurstDetector()
    d.change("6164", 0)
    d.change("61640012", 15)
    d.change("6164001234567", 30)
    expect(d.submit("6164001234567", 45).kind).toBe("scan")
  })

  it("a slow Enter after a burst is a search", () => {
    const d = createBurstDetector()
    const [text, last] = type(d, "", "12345678", 0, 5)
    expect(d.submit(text, last + 500).kind).toBe("search")
  })

  it("too-short bursts and edits are not scans", () => {
    const d = createBurstDetector()
    const [text, last] = type(d, "", "ab", 0, 5)
    expect(d.submit(text, last + 5).kind).toBe("search")
    const e = createBurstDetector()
    type(e, "", "123456", 0, 5)
    e.change("12346", 30) // deletion mid-burst
    expect(e.submit("12346", 35).kind).toBe("search")
  })
})
