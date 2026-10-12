import { describe, expect, it } from "vitest"
import { createDebouncedWriter, type TimerApi } from "../debouncedWriter"

/** Manual clock: timers only fire when advance() passes their due time. */
function fakeTimers() {
  let now = 0
  let seq = 0
  const due = new Map<number, { at: number; fn: () => void }>()
  const api: TimerApi = {
    set: (fn, ms) => {
      const id = ++seq
      due.set(id, { at: now + ms, fn })
      return id
    },
    clear: (h) => {
      due.delete(h as number)
    },
  }
  const advance = (ms: number) => {
    now += ms
    for (const [id, t] of [...due]) {
      if (t.at <= now) {
        due.delete(id)
        t.fn()
      }
    }
  }
  return { api, advance, pending: () => due.size }
}

describe("debounced cart persistence", () => {
  it("coalesces a burst into one trailing write of the latest value", () => {
    const writes: number[][] = []
    const t = fakeTimers()
    const w = createDebouncedWriter<number[]>((v) => writes.push(v), 300, t.api)
    w.schedule([1])
    t.advance(100)
    w.schedule([1, 2])
    t.advance(100)
    w.schedule([1, 2, 3])
    expect(writes).toEqual([])
    t.advance(299)
    expect(writes).toEqual([])
    t.advance(1)
    expect(writes).toEqual([[1, 2, 3]])
    expect(w.hasPending()).toBe(false)
  })

  it("flush writes the pending value immediately and only once", () => {
    const writes: string[] = []
    const t = fakeTimers()
    const w = createDebouncedWriter<string>((v) => writes.push(v), 300, t.api)
    w.schedule("a")
    w.flush()
    expect(writes).toEqual(["a"])
    t.advance(1_000)
    expect(writes).toEqual(["a"])
    w.flush()
    expect(writes).toEqual(["a"])
  })

  it("writeNow (empty cart after a sale) wins over anything pending", () => {
    const writes: number[][] = []
    const t = fakeTimers()
    const w = createDebouncedWriter<number[]>((v) => writes.push(v), 300, t.api)
    w.schedule([1, 2])
    w.writeNow([])
    expect(writes).toEqual([[]])
    t.advance(1_000)
    // The stale [1, 2] must never land after the clear.
    expect(writes).toEqual([[]])
    expect(t.pending()).toBe(0)
  })
})
