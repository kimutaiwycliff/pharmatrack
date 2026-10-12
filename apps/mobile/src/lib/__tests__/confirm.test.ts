import { describe, expect, it } from "vitest"
import { confirm, useConfirmStore } from "../confirm"

describe("confirm()", () => {
  it("resolves true when confirmed and clears the request", async () => {
    const p = confirm({ title: "Delete?", confirmLabel: "Delete", destructive: true })
    const req = useConfirmStore.getState().request
    expect(req).toMatchObject({ title: "Delete?", destructive: true })
    useConfirmStore.getState().answer(req!.id, true)
    await expect(p).resolves.toBe(true)
    expect(useConfirmStore.getState().request).toBeNull()
  })

  it("resolves false on cancel / dismiss, and a late second answer is ignored", async () => {
    const p = confirm({ title: "Log out", confirmLabel: "Log out" })
    const id = useConfirmStore.getState().request!.id
    useConfirmStore.getState().answer(id, false)
    useConfirmStore.getState().answer(id, true)
    await expect(p).resolves.toBe(false)
  })

  it("a new question answers the open one 'no'", async () => {
    const first = confirm({ title: "First", confirmLabel: "OK" })
    const second = confirm({ title: "Second", confirmLabel: "OK" })
    await expect(first).resolves.toBe(false)
    expect(useConfirmStore.getState().request?.title).toBe("Second")
    useConfirmStore.getState().answer(useConfirmStore.getState().request!.id, true)
    await expect(second).resolves.toBe(true)
  })
})
