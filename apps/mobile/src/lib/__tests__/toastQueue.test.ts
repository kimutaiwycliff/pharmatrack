import { describe, expect, it } from "vitest"
import { dismissToast, MAX_TOASTS, pushToast, toastDurationMs, toastLabel, type ToastItem } from "../toastQueue"

const push = (list: ToastItem[], message: string, id: number, variant: ToastItem["variant"] = "success") =>
  pushToast(list, { message, variant }, id)

describe("toast queue", () => {
  it("adds a new toast with count 1", () => {
    const r = push([], "Added Panadol", 1)
    expect(r.toasts).toEqual([{ id: 1, message: "Added Panadol", variant: "success", count: 1, action: undefined }])
    expect(r).toMatchObject({ id: 1, collapsed: false, dropped: [] })
  })

  it("collapses a repeated message into the visible toast and moves it to the newest slot", () => {
    let list = push([], "Added Panadol", 1).toasts
    list = push(list, "Added Amoxil", 2).toasts
    const r = push(list, "Added Panadol", 3)
    expect(r.collapsed).toBe(true)
    expect(r.id).toBe(1)
    expect(r.toasts.map((t) => [t.id, t.count])).toEqual([
      [2, 1],
      [1, 2],
    ])
    expect(toastLabel(r.toasts[1]!)).toBe("Added Panadol ×2")
  })

  it("counts up across a scanning burst", () => {
    let list: ToastItem[] = []
    for (let i = 1; i <= 3; i++) list = push(list, "Added Panadol", i).toasts
    expect(list).toHaveLength(1)
    expect(toastLabel(list[0]!)).toBe("Added Panadol ×3")
  })

  it("does not collapse the same text with a different variant", () => {
    const list = push([], "Saved", 1, "success").toasts
    expect(push(list, "Saved", 2, "info").toasts).toHaveLength(2)
  })

  it("never collapses toasts with an action (each Undo is distinct)", () => {
    const action = { label: "Undo", onPress: () => {} }
    const a = pushToast([], { message: "Removed X", variant: "info", action }, 1)
    const b = pushToast(a.toasts, { message: "Removed X", variant: "info", action }, 2)
    expect(b.collapsed).toBe(false)
    expect(b.toasts).toHaveLength(2)
  })

  it(`caps at ${MAX_TOASTS}, dropping the oldest`, () => {
    let list: ToastItem[] = []
    for (let i = 1; i <= MAX_TOASTS; i++) list = push(list, `m${i}`, i).toasts
    const r = push(list, "m4", 4)
    expect(r.toasts.map((t) => t.id)).toEqual([2, 3, 4])
    expect(r.dropped).toEqual([1])
  })

  it("dismisses by id", () => {
    const list = push(push([], "a", 1).toasts, "b", 2).toasts
    expect(dismissToast(list, 1).map((t) => t.id)).toEqual([2])
  })

  it("keeps action toasts up longer than plain ones", () => {
    expect(toastDurationMs({ variant: "info", action: { label: "Undo", onPress: () => {} } })).toBeGreaterThan(toastDurationMs({ variant: "info" }))
    expect(toastLabel({ message: "x", count: 1 })).toBe("x")
  })
})
