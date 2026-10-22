import { describe, expect, it } from "vitest"
import {
  DEFAULT_RECEIPT_SETTINGS, EscPos, applyReceiptProfile, base64ToBytes, bytesToBase64, ditherToRaster, encodeReceipt,
  normalizeReceiptSettings, qrPath, receiptFooterLines, receiptHeaderLines, receiptPreview, receiptProfileFrom,
  isPhotoLike, logoToRaster, validLogoRaster, type ReceiptDoc, type ReceiptProfile,
} from "@pharmatrack/core"

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(" ")

const sale: ReceiptDoc = {
  shopName: "Afya Bora Ltd", branchName: "Westlands", address: "Sarit Centre", phone: null,
  receiptNumber: "R-000123", dateText: "22/10/2026 14:05", cashier: "Jane", customer: "Peter",
  lines: [{ name: "Amoxil 500mg", qtyLabel: "21 capsules", unitPriceCents: 3000, totalCents: 63000 }],
  subtotalCents: 63000, discountCents: 0, totalCents: 63000, paymentLabel: "Cash", paidCents: 70000, changeCents: 7000,
}

const profile = (settings: Record<string, unknown> = {}, org: Partial<ReceiptProfile["org"]> = {}): ReceiptProfile =>
  receiptProfileFrom(org.name ?? "Afya Bora Ltd", {
    registration_number: "PPB/123", phone: "0712345678", email: "hi@afya.co.ke", address: "Nairobi", ...org, receipt: settings,
  })

describe("normalizeReceiptSettings", () => {
  it("fills defaults for missing or junk input", () => {
    expect(normalizeReceiptSettings(undefined)).toEqual(DEFAULT_RECEIPT_SETTINGS)
    expect(normalizeReceiptSettings("nope")).toEqual(DEFAULT_RECEIPT_SETTINGS)
    expect(normalizeReceiptSettings({ show_phone: "yes" }).show_phone).toBe(true)
  })

  it("keeps an emptied footer empty, trims and caps lines", () => {
    const s = normalizeReceiptSettings({ footer_lines: [], header_lines: ["  Open   24 hours ", "", "b", "c"] })
    expect(s.footer_lines).toEqual([])
    expect(s.header_lines).toEqual(["Open 24 hours", "b"])
  })

  it("rejects unsafe QR links and bad logos", () => {
    expect(normalizeReceiptSettings({ qr_url: "javascript:alert(1)" }).qr_url).toBeNull()
    expect(normalizeReceiptSettings({ qr_url: "https://wa.me/254712345678" }).qr_url).toBe("https://wa.me/254712345678")
    expect(normalizeReceiptSettings({ logo: { data_url: "data:image/svg+xml;base64,PHN2Zz4=" } }).logo).toBeNull()
    const logo = normalizeReceiptSettings({ logo: { data_url: "data:image/png;base64,iVBORw0KGgo=", raster: { width: 8, height: 2, data: "AAAA" } } }).logo
    expect(logo?.raster).toBeNull() // 4 base64 chars = 3 bytes, not 1 × 2
  })

  it("upper-cases the KRA PIN", () => {
    expect(normalizeReceiptSettings({ kra_pin: " p051234567x " }).kra_pin).toBe("P051234567X")
  })
})

describe("applyReceiptProfile", () => {
  it("leaves the doc alone without a profile", () => {
    expect(applyReceiptProfile(sale, null)).toBe(sale)
  })

  it("prints the default header from org + branch, branch details first", () => {
    const doc = applyReceiptProfile(sale, profile(), { name: "Westlands", address: "Sarit Centre", phone: "0722000000" })
    expect(receiptHeaderLines(doc)).toEqual(["Westlands", "Sarit Centre", "Tel: 0722000000", "Licence No: PPB/123"])
    expect(receiptFooterLines(doc)).toEqual(["Thank you - get well soon"])
  })

  it("falls back to the organisation's contacts and honours every toggle", () => {
    const doc = applyReceiptProfile(sale, profile({
      display_name: "Afya Bora Chemist", show_branch: false, show_email: true, show_licence: false, kra_pin: "P051234567X",
      header_lines: ["Open 24 hours"], footer_lines: ["Get well soon", "Returns within 7 days"],
      show_cashier: false, show_customer: false, show_unit_price: false, qr_url: "https://example.com", qr_caption: "Review us",
    }), { name: "Westlands" })
    expect(doc.shopName).toBe("Afya Bora Chemist")
    expect(receiptHeaderLines(doc)).toEqual(["Sarit Centre", "Tel: 0712345678", "hi@afya.co.ke", "KRA PIN: P051234567X", "Open 24 hours"])
    expect(doc.cashier).toBeNull()
    expect(doc.customer).toBeNull()
    expect(doc.lines[0]!.unitPriceCents).toBeNull()
    expect(doc.qrData).toBe("https://example.com")
    expect(doc.qrCaption).toBe("Review us")
  })

  it("doesn't print a branch named like the shop twice", () => {
    const doc = applyReceiptProfile({ ...sale, branchName: "Afya Bora Ltd" }, profile())
    expect(doc.branchName).toBeNull()
  })

  it("lays the owner's lines out on paper, unit price included", () => {
    const doc = applyReceiptProfile(sale, profile({ header_lines: ["Open 24 hours"], footer_lines: ["See you soon"] }))
    const text = receiptPreview(doc, "58mm").join("\n")
    expect(text).toContain("Open 24 hours")
    expect(text).toContain("21 capsules @ 30.00")
    expect(text.trimEnd().endsWith("See you soon")).toBe(true)
  })

  it("prints no closing rule or footer when the owner cleared it", () => {
    const rows = receiptPreview(applyReceiptProfile(sale, profile({ footer_lines: [] })), "80mm")
    expect(rows.at(-1)).toContain("Change")
  })
})

describe("logo raster", () => {
  it("dithers greyscale into packed 1-bit rows padded to whole bytes", () => {
    // 10 × 2: left half black, right half white.
    const gray = Array.from({ length: 20 }, (_, i) => (i % 10 < 5 ? 0 : 255))
    const r = ditherToRaster(gray, 10, 2)
    expect(r.width).toBe(16)
    expect(Array.from(base64ToBytes(r.data))).toEqual([0xf8, 0x00, 0xf8, 0x00])
    expect(validLogoRaster(r)).toEqual(r)
  })

  it("prints flat coloured logos solid and dithers only photos", () => {
    // A teal block (luminance ≈ 86) with white around it: solid black, no speckle.
    const flat = Array.from({ length: 16 }, (_, i) => (i % 8 < 4 ? 86 : 255))
    expect(isPhotoLike(flat)).toBe(false)
    expect(Array.from(base64ToBytes(logoToRaster(flat, 8, 2).data))).toEqual([0xf0, 0xf0])
    // A smooth gradient is a photo.
    const ramp = Array.from({ length: 256 }, (_, i) => i)
    expect(isPhotoLike(ramp)).toBe(true)
  })

  it("round-trips base64", () => {
    const bytes = Uint8Array.from([0, 1, 2, 250, 251, 252, 253])
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes))
    expect(bytesToBase64(Uint8Array.from([0xf8]))).toBe("+A==")
  })

  it("sends GS v 0 in bands of 48 rows", () => {
    const b = new EscPos().raster(8, 50, new Uint8Array(50).fill(0xff)).bytes()
    expect(hex(b.slice(0, 8))).toBe("1d 76 30 00 01 00 30 00")
    expect(hex(b.slice(56, 64))).toBe("1d 76 30 00 01 00 02 00")
    expect(b.length).toBe(8 + 48 + 8 + 2)
  })

  it("prints the logo first and skips one too wide for the paper", () => {
    const logo = { width: 384, height: 1, data: bytesToBase64(new Uint8Array(48)) }
    const withLogo = hex(encodeReceipt({ ...sale, logoRaster: logo }, { paper: "58mm" }))
    expect(withLogo.startsWith("1b 40 1b 74 00 1b 61 01 1d 76 30 00 30 00 01 00")).toBe(true)
    const wide = { width: 576, height: 1, data: bytesToBase64(new Uint8Array(72)) }
    expect(hex(encodeReceipt({ ...sale, logoRaster: wide }, { paper: "58mm" }))).not.toContain("1d 76 30")
  })
})

describe("qrPath", () => {
  it("draws a square module grid with a quiet zone", () => {
    const { size, d } = qrPath("https://wa.me/254712345678")
    expect(size).toBeGreaterThanOrEqual(25)
    expect(d.startsWith("M2 2h1v1h-1z")).toBe(true) // top-left finder corner
  })
})
