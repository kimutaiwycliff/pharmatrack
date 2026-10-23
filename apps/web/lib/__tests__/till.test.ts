import "fake-indexeddb/auto"
import { beforeEach, describe, expect, it, vi } from "vitest"
import bcrypt from "bcryptjs"
import { EMPTY_ANCHORS, nairobiYYMMDD } from "@pharmatrack/core/sync"
import { setMeta, setTillDB, TillDB, tillDB } from "@/lib/till/db"
import { applyPullPage, newPullContext, type PullResponse } from "@/lib/till/pull-apply"
import { AllowanceError, cartToLines, commitTillSale, TillLockedError } from "@/lib/till/commit-sale"
import { closeShift, openShift } from "@/lib/till/shifts"
import { outboxCounts, pendingSaleQuantities } from "@/lib/till/outbox"
import { setTillSession, verifyRosterPin } from "@/lib/till/staff"
import { syncNow } from "@/lib/till/engine"
import type { CartItem } from "@pharmatrack/types"

const P1 = "11111111-1111-4111-8111-111111111111"
const P2 = "22222222-2222-4222-8222-222222222222"
const STAFF = "staff-1"
const HOUR = 3_600_000

let n = 0
beforeEach(async () => {
  setTillDB(new TillDB(`till-test-${++n}`))
  setTillSession({ organizationId: "org-1", userId: STAFF, name: "Asha", role: "cashier" })
  await setMeta("token", "ptd_test")
  await setMeta("device", { id: "dev-1", name: "Front PC", code: "D01", branchId: "br-1", branchName: "Main", organizationId: "org-1", organizationName: "Afya" })
  // Synced recently: deadline is in the future, so the till may sell.
  await setMeta("sync", { cursor: null, deadline: Date.now() + 6 * HOUR, lastSyncAt: Date.now(), clock: EMPTY_ANCHORS, override: null, revoked: false, subscriptionInactive: false })
})

function pull(over: Partial<PullResponse> = {}): PullResponse {
  return {
    server_time: new Date().toISOString(), deadline: new Date(Date.now() + 6 * HOUR).toISOString(), cursor: new Date().toISOString(),
    has_more: false, next: null, full: true,
    device: { id: "dev-1", name: "Front PC", code: "D01", branch_id: "br-1" },
    organization: { id: "org-1", name: "Afya" },
    branch: { id: "br-1", name: "Main", address: "Moi Ave", phone: null },
    products: [
      { id: P1, name: "Panadol", brand_name: null, generic_name: "Paracetamol", strength: "500mg", dosage_form: "tablet", base_unit: "tablet", pack_label: null, units_per_pack: 1, selling_price: 5, max_discount_percent: null, gtin: "6001", barcode_raw: null, category_id: null, image_url: null, is_controlled: false, requires_prescription: false, is_active: true, updated_at: new Date().toISOString() },
      { id: P2, name: "Amoxil", brand_name: null, generic_name: "Amoxicillin", strength: "250mg", dosage_form: "capsule", base_unit: "capsule", pack_label: null, units_per_pack: 1, selling_price: 10, max_discount_percent: null, gtin: null, barcode_raw: null, category_id: null, image_url: null, is_controlled: false, requires_prescription: true, is_active: true, updated_at: new Date().toISOString() },
    ],
    pack_sizes: [], categories: [], tombstones: [],
    staff: [{ id: STAFF, name: "Asha", role: "cashier", phone: "+254700000001", branch_id: "br-1", is_active: true, pin_hash: bcrypt.hashSync("1234", 4), permissions: ["pos.sell"] }],
    stock: [{ product_id: P1, stock_on_hand: 100, earliest_expiry: "2027-01-01" }, { product_id: P2, stock_on_hand: 8, earliest_expiry: null }],
    allocation: { items: [{ product_id: P1, quantity: 40 }, { product_id: P2, quantity: 8 }], reserved_until: new Date(Date.now() + 18 * HOUR).toISOString(), share: 0.5 },
    ...over,
  }
}

function cartLine(id: string, name: string, qty: number, price: number): CartItem {
  return {
    product_id: id, product_name: name, product_strength: null, batch_id: null, quantity: qty, unit_price: price,
    discount_percent: 0, line_total: qty * price, base_unit: "tablet", is_controlled: false, max_discount_percent: null, stock_on_hand: 100,
  }
}

async function shift() {
  return openShift({ cashierId: STAFF, cashierName: "Asha", openingFloatCents: 50_000 })
}

describe("pull", () => {
  it("applies products, stock, allowance and roster", async () => {
    await applyPullPage(pull(), { ...newPullContext(true, true), last: true })
    const db = tillDB()
    expect(await db.products.count()).toBe(2)
    expect((await db.products.get(P1))?.stock_on_hand).toBe(100)
    expect((await db.allowances.get(P1))?.quantity).toBe(40)
    expect((await db.staff.get(STAFF))?.name).toBe("Asha")
  })

  it("keeps unsynced sales off the server's numbers", async () => {
    await applyPullPage(pull(), { ...newPullContext(true, true), last: true })
    const s = await shift()
    await commitTillSale({ cashierId: STAFF, shiftClientId: s.client_id, lines: cartToLines([cartLine(P1, "Panadol", 10, 5)]), payment: { method: "cash", tenderedCents: 5000 } })
    // The server hasn't seen the sale yet, so it still says 100 / 40.
    await applyPullPage(pull(), { ...newPullContext(false, false), last: true })
    expect((await tillDB().products.get(P1))?.stock_on_hand).toBe(90)
    expect((await tillDB().allowances.get(P1))?.quantity).toBe(30)
    expect((await pendingSaleQuantities()).get(P1)).toBe(10)
  })
})

describe("commitTillSale", () => {
  beforeEach(async () => {
    await applyPullPage(pull(), { ...newPullContext(true, true), last: true })
  })

  it("records the sale, numbers the receipt and takes stock off", async () => {
    const s = await shift()
    const a = await commitTillSale({ cashierId: STAFF, shiftClientId: s.client_id, lines: cartToLines([cartLine(P1, "Panadol", 4, 5)]), payment: { method: "cash", tenderedCents: 5000 }, discountCents: 200 })
    const b = await commitTillSale({ cashierId: STAFF, shiftClientId: s.client_id, lines: cartToLines([cartLine(P1, "Panadol", 1, 5)]), payment: { method: "mpesa", reference: "QWE123RTY0", verified: false } })
    const day = nairobiYYMMDD(Date.now())
    expect(a.receiptNumber).toBe(`D01-${day}-0001`)
    expect(b.receiptNumber).toBe(`D01-${day}-0002`)
    expect(a.payload.total_amount).toBe(18)
    expect(a.payload.discount_amount).toBe(2)
    expect(a.payload.change_given).toBe(32)
    expect(Math.abs(new Date(a.payload.sold_at).getTime() - Date.now())).toBeLessThan(5000)
    expect(b.payload.mpesa_verified).toBe(false)
    expect((await tillDB().allowances.get(P1))?.quantity).toBe(35)
    expect((await tillDB().products.get(P1))?.stock_on_hand).toBe(95)
    expect((await outboxCounts()).pendingSales).toBe(2)
    // Only the cash sale goes into the drawer.
    expect((await tillDB().shifts.get(s.client_id))?.cash_sales_cents).toBe(1800)
  })

  it("never sells more than this computer's share", async () => {
    const s = await shift()
    await expect(
      commitTillSale({ cashierId: STAFF, shiftClientId: s.client_id, lines: cartToLines([cartLine(P1, "Panadol", 41, 5)]), payment: { method: "cash", tenderedCents: 50_000 } }),
    ).rejects.toBeInstanceOf(AllowanceError)
    // Nothing was written: no receipt number used, stock untouched.
    expect((await outboxCounts()).pendingSales).toBe(0)
    expect((await tillDB().allowances.get(P1))?.quantity).toBe(40)
    expect(await tillDB().counters.count()).toBe(0)
  })

  it("refuses to sell after a missed midnight sync", async () => {
    const s = await shift()
    await setMeta("sync", { cursor: "x", deadline: Date.now() - HOUR, lastSyncAt: Date.now() - 20 * HOUR, clock: EMPTY_ANCHORS, override: null, revoked: false, subscriptionInactive: false })
    await expect(
      commitTillSale({ cashierId: STAFF, shiftClientId: s.client_id, lines: cartToLines([cartLine(P1, "Panadol", 1, 5)]), payment: { method: "cash", tenderedCents: 500 } }),
    ).rejects.toBeInstanceOf(TillLockedError)
  })
})

describe("shifts and PINs", () => {
  beforeEach(async () => {
    await applyPullPage(pull(), { ...newPullContext(true, true), last: true })
  })

  it("works out the cash variance locally", async () => {
    const s = await shift()
    await commitTillSale({ cashierId: STAFF, shiftClientId: s.client_id, lines: cartToLines([cartLine(P1, "Panadol", 10, 5)]), payment: { method: "cash", tenderedCents: 5000 } })
    const { varianceCents } = await closeShift({ clientId: s.client_id, closingCashCents: 54_900, notes: null })
    expect(varianceCents).toBe(-100)
    const types = (await tillDB().outbox.toArray()).map((r) => r.type)
    expect(types).toEqual(["shift_open", "sale", "shift_close"])
  })

  it("checks the server's PIN hash and locks after 5 wrong tries", async () => {
    expect((await verifyRosterPin(STAFF, "1234")).ok).toBe(true)
    for (let i = 0; i < 4; i++) expect((await verifyRosterPin(STAFF, "0000")).ok).toBe(false)
    const fifth = await verifyRosterPin(STAFF, "0000")
    expect(fifth.ok).toBe(false)
    if (!fifth.ok) expect(fifth.error).toMatch(/Too many wrong PINs/)
    // Even the right PIN is refused while locked.
    expect((await verifyRosterPin(STAFF, "1234")).ok).toBe(false)
  })
})

describe("sync engine", () => {
  it("uploads the outbox in order, then downloads and moves the deadline", async () => {
    await applyPullPage(pull(), { ...newPullContext(true, true), last: true })
    const s = await shift()
    await commitTillSale({ cashierId: STAFF, shiftClientId: s.client_id, lines: cartToLines([cartLine(P1, "Panadol", 2, 5)]), payment: { method: "cash", tenderedCents: 1000 } })

    const pushed: string[] = []
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe("Device ptd_test")
      if (url.startsWith("/api/sync/push")) {
        const body = JSON.parse(String(init?.body)) as { items: { client_id: string; type: string }[] }
        pushed.push(...body.items.map((i) => i.type))
        return new Response(JSON.stringify({ results: body.items.map((i) => ({ client_id: i.client_id, status: "synced", server_id: "srv" })), server_time: new Date().toISOString() }))
      }
      // The server has now subtracted the sale.
      return new Response(JSON.stringify(pull({ full: false, stock: [{ product_id: P1, stock_on_hand: 98, earliest_expiry: null }, { product_id: P2, stock_on_hand: 8, earliest_expiry: null }] })))
    })
    vi.stubGlobal("fetch", fetchMock)
    const r = await syncNow("test")
    vi.unstubAllGlobals()

    expect(r.ok).toBe(true)
    expect(pushed).toEqual(["shift_open", "sale"])
    expect((await outboxCounts()).pending).toBe(0)
    expect((await tillDB().products.get(P1))?.stock_on_hand).toBe(98)
  })

  it("keeps sales queued when the network is down", async () => {
    await applyPullPage(pull(), { ...newPullContext(true, true), last: true })
    const s = await shift()
    await commitTillSale({ cashierId: STAFF, shiftClientId: s.client_id, lines: cartToLines([cartLine(P1, "Panadol", 1, 5)]), payment: { method: "cash", tenderedCents: 500 } })
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch") }))
    const r = await syncNow("test")
    vi.unstubAllGlobals()
    expect(r.outcome).toBe("offline")
    expect((await outboxCounts()).pending).toBe(2)
  })
})

describe("saleTimestamp (offline sales queued by an unregistered browser)", () => {
  it("dates a synced offline sale when it was sold, within limits", async () => {
    const { saleTimestamp } = await import("@/lib/sales/sold-at")
    const now = Date.parse("2026-10-23T09:00:00Z")
    const yesterday = "2026-10-22T18:30:00.000Z"
    expect(saleTimestamp("ref-1", yesterday, now).toISOString()).toBe(yesterday)
    // No offline reference → it's a live sale: now.
    expect(saleTimestamp(null, yesterday, now).getTime()).toBe(now)
    // Future or very old times are not believed.
    expect(saleTimestamp("ref-1", "2026-10-24T00:00:00Z", now).getTime()).toBe(now)
    expect(saleTimestamp("ref-1", "2026-08-01T00:00:00Z", now).getTime()).toBe(now)
  })
})
