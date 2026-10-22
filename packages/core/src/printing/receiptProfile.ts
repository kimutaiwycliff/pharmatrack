// Receipt customisation (web Settings → Receipt). The owner's choices live in
// org_settings.settings.receipt; `applyReceiptProfile` folds them into the
// shared ReceiptDoc so every renderer — thermal ESC/POS, the web modal and
// PDF, Android's printed HTML and WhatsApp text — shows the same header and
// footer. Renderers never look at the settings themselves, only at the doc.
import qrcode from "qrcode-generator"
import type { ReceiptDoc } from "./receipt"

/** A logo as 1-bit dots for thermal printers: rows packed MSB-first, 1 = black. */
export interface LogoRaster {
  /** Dots per row — a multiple of 8. */
  width: number
  height: number
  /** base64 of (width / 8) × height bytes. */
  data: string
}

export interface ReceiptLogo {
  /** Small PNG/JPEG data URL for screens, PDFs and Android's printed page. */
  data_url: string
  /** Pre-dithered copy for ESC/POS printers (made in the browser on upload). */
  raster: LogoRaster | null
}

export interface ReceiptSettings {
  /** Trading name printed instead of the registered organisation name. */
  display_name: string | null
  show_branch: boolean
  show_address: boolean
  show_phone: boolean
  show_email: boolean
  /** The PPB licence / registration number from Settings → Organization. */
  show_licence: boolean
  kra_pin: string | null
  /** Extra lines under the shop details, e.g. "Open 24 hours". */
  header_lines: string[]
  /** Closing lines, e.g. a return policy or "Get well soon". */
  footer_lines: string[]
  show_cashier: boolean
  show_customer: boolean
  show_unit_price: boolean
  /** Printed as a QR code at the bottom (a WhatsApp, review or website link). */
  qr_url: string | null
  qr_caption: string | null
  logo: ReceiptLogo | null
  /** Print the logo on thermal printers too (slower on some Bluetooth units). */
  print_logo: boolean
}

/** What a receipt needs from Settings → Organization. */
export interface ReceiptOrgInfo {
  name: string
  registration_number: string | null
  phone: string | null
  email: string | null
  address: string | null
}

/** Everything a client needs to brand a receipt (GET /api/receipt-profile, /api/mobile/me). */
export interface ReceiptProfile {
  org: ReceiptOrgInfo
  settings: ReceiptSettings
}

export const RECEIPT_LIMITS = {
  displayName: 60,
  headerLines: 2,
  footerLines: 3,
  lineChars: 64,
  kraPin: 20,
  qrUrl: 300,
  qrCaption: 48,
  /** ~60 KB image; the settings form downsizes logos well under this. */
  logoDataUrlChars: 80_000,
  /** 72 mm at 203 dpi — the printable width of an 80 mm roll. */
  rasterMaxWidth: 576,
  rasterMaxHeight: 240,
} as const

export const DEFAULT_FOOTER = "Thank you - get well soon"

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  display_name: null,
  show_branch: true,
  show_address: true,
  show_phone: true,
  show_email: false,
  show_licence: true,
  kra_pin: null,
  header_lines: [],
  footer_lines: [DEFAULT_FOOTER],
  show_cashier: true,
  show_customer: true,
  show_unit_price: true,
  qr_url: null,
  qr_caption: null,
  logo: null,
  print_logo: true,
}

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null
  const t = v.replace(/\s+/g, " ").trim().slice(0, max)
  return t || null
}
const lines = (v: unknown, count: number): string[] | null =>
  Array.isArray(v) ? v.map((x) => text(x, RECEIPT_LIMITS.lineChars)).filter((x): x is string => !!x).slice(0, count) : null
const flag = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback)

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

/** Null unless the raster's size and data agree (a bad one would garble the printer). */
export function validLogoRaster(v: unknown): LogoRaster | null {
  if (!v || typeof v !== "object") return null
  const r = v as Partial<LogoRaster>
  if (typeof r.width !== "number" || typeof r.height !== "number" || typeof r.data !== "string") return null
  if (!Number.isInteger(r.width) || r.width < 8 || r.width % 8 !== 0 || r.width > RECEIPT_LIMITS.rasterMaxWidth) return null
  if (!Number.isInteger(r.height) || r.height < 1 || r.height > RECEIPT_LIMITS.rasterMaxHeight) return null
  if (r.data.length % 4 !== 0 || !BASE64.test(r.data) || base64ByteLength(r.data) !== (r.width / 8) * r.height) return null
  return { width: r.width, height: r.height, data: r.data }
}

/** Accepts only small inline PNG/JPEG images (react-pdf can't draw WebP). */
export function validLogoDataUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length > RECEIPT_LIMITS.logoDataUrlChars) return null
  return /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(v) ? v : null
}

/** Only web links (incl. wa.me) and tel: — never javascript: or data:. */
export function validQrUrl(v: unknown): string | null {
  const t = text(v, RECEIPT_LIMITS.qrUrl)
  if (!t) return null
  return /^(https?:\/\/|tel:)\S+$/i.test(t) ? t : null
}

/**
 * Whatever is stored (possibly from an older version, possibly hand-edited)
 * → complete, safe settings. Missing keys take the defaults; an empty footer
 * the owner saved on purpose stays empty.
 */
export function normalizeReceiptSettings(raw: unknown): ReceiptSettings {
  const d = DEFAULT_RECEIPT_SETTINGS
  if (!raw || typeof raw !== "object") return { ...d, header_lines: [...d.header_lines], footer_lines: [...d.footer_lines] }
  const r = raw as Record<string, unknown>
  const logoRaw = r.logo && typeof r.logo === "object" ? (r.logo as Record<string, unknown>) : null
  const dataUrl = logoRaw ? validLogoDataUrl(logoRaw.data_url) : null
  return {
    display_name: text(r.display_name, RECEIPT_LIMITS.displayName),
    show_branch: flag(r.show_branch, d.show_branch),
    show_address: flag(r.show_address, d.show_address),
    show_phone: flag(r.show_phone, d.show_phone),
    show_email: flag(r.show_email, d.show_email),
    show_licence: flag(r.show_licence, d.show_licence),
    kra_pin: text(r.kra_pin, RECEIPT_LIMITS.kraPin)?.toUpperCase() ?? null,
    header_lines: lines(r.header_lines, RECEIPT_LIMITS.headerLines) ?? [...d.header_lines],
    footer_lines: lines(r.footer_lines, RECEIPT_LIMITS.footerLines) ?? [...d.footer_lines],
    show_cashier: flag(r.show_cashier, d.show_cashier),
    show_customer: flag(r.show_customer, d.show_customer),
    show_unit_price: flag(r.show_unit_price, d.show_unit_price),
    qr_url: validQrUrl(r.qr_url),
    qr_caption: text(r.qr_caption, RECEIPT_LIMITS.qrCaption),
    logo: dataUrl ? { data_url: dataUrl, raster: validLogoRaster(logoRaw?.raster) } : null,
    print_logo: flag(r.print_logo, d.print_logo),
  }
}

/** org_settings.settings (+ the organisation's name) → the profile clients receive. */
export function receiptProfileFrom(orgName: string, settings: unknown): ReceiptProfile {
  const s = (settings && typeof settings === "object" ? settings : {}) as Record<string, unknown>
  const str = (k: string) => {
    const v = s[k]
    return typeof v === "string" && v.trim() ? v.trim() : null
  }
  return {
    org: { name: orgName, registration_number: str("registration_number"), phone: str("phone"), email: str("email"), address: str("address") },
    settings: normalizeReceiptSettings(s.receipt),
  }
}

export interface ReceiptBranchInfo {
  name?: string | null
  address?: string | null
  phone?: string | null
}

const same = (a?: string | null, b?: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * A sale's receipt with the owner's header/footer choices applied. Without a
 * profile (Offline Edition, older caches) the doc comes back as it was. Branch
 * contact details win over the organisation's, which are the fallback.
 */
export function applyReceiptProfile(doc: ReceiptDoc, profile: ReceiptProfile | null | undefined, branch?: ReceiptBranchInfo): ReceiptDoc {
  if (!profile) return doc
  const { org, settings: s } = profile
  const shopName = s.display_name || org.name || doc.shopName
  const branchName = branch?.name ?? doc.branchName ?? null
  return {
    ...doc,
    shopName,
    // A one-branch shop often names the branch after itself — don't print it twice.
    branchName: s.show_branch && branchName && !same(branchName, shopName) ? branchName : null,
    address: s.show_address ? branch?.address || doc.address || org.address : null,
    phone: s.show_phone ? branch?.phone || doc.phone || org.phone : null,
    email: s.show_email ? org.email : null,
    registration: s.show_licence && org.registration_number ? `Licence No: ${org.registration_number}` : null,
    kraPin: s.kra_pin,
    headerLines: s.header_lines,
    footerLines: s.footer_lines,
    cashier: s.show_cashier ? doc.cashier : null,
    customer: s.show_customer ? doc.customer : null,
    lines: s.show_unit_price ? doc.lines : doc.lines.map((l) => ({ ...l, unitPriceCents: null })),
    qrData: s.qr_url,
    qrCaption: s.qr_url ? s.qr_caption : null,
    logoDataUrl: s.logo?.data_url ?? null,
    logoRaster: s.print_logo ? s.logo?.raster ?? null : null,
  }
}

// ── Logo → printer dots ─────────────────────────────────────────────────────

/**
 * Greyscale pixels (0 = black … 255 = white, row-major) → a 1-bit raster with
 * Floyd–Steinberg dithering, so photos and gradients keep their shape on a
 * thermal printer. `width` is padded up to a multiple of 8 with white.
 */
export function ditherToRaster(gray: ArrayLike<number>, width: number, height: number, threshold = 128): LogoRaster {
  const w8 = Math.ceil(width / 8) * 8
  const rowBytes = w8 / 8
  const buf = new Float32Array(w8 * height).fill(255)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) buf[y * w8 + x] = gray[y * width + x] ?? 255
  const bytes = new Uint8Array(rowBytes * height)
  const spread = (i: number, amount: number) => {
    buf[i] = (buf[i] ?? 0) + amount
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < w8; x++) {
      const i = y * w8 + x
      const old = buf[i] ?? 255
      const black = old < threshold
      const err = old - (black ? 0 : 255)
      if (black) bytes[y * rowBytes + (x >> 3)] = (bytes[y * rowBytes + (x >> 3)] ?? 0) | (0x80 >> (x & 7))
      if (x + 1 < w8) spread(i + 1, (err * 7) / 16)
      if (y + 1 < height) {
        if (x > 0) spread(i + w8 - 1, (err * 3) / 16)
        spread(i + w8, (err * 5) / 16)
        if (x + 1 < w8) spread(i + w8 + 1, err / 16)
      }
    }
  }
  return { width: w8, height, data: bytesToBase64(bytes) }
}

/**
 * Flat artwork (most logos: a few solid colours plus anti-aliased edges) →
 * every non-white pixel black, so a teal or red logo prints solid instead of
 * as grey speckle. Rows padded to whole bytes like `ditherToRaster`.
 */
export function thresholdToRaster(gray: ArrayLike<number>, width: number, height: number, threshold = 200): LogoRaster {
  const w8 = Math.ceil(width / 8) * 8
  const rowBytes = w8 / 8
  const bytes = new Uint8Array(rowBytes * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((gray[y * width + x] ?? 255) < threshold) bytes[y * rowBytes + (x >> 3)] = (bytes[y * rowBytes + (x >> 3)] ?? 0) | (0x80 >> (x & 7))
    }
  }
  return { width: w8, height, data: bytesToBase64(bytes) }
}

/**
 * Photo or shaded artwork? Flat logos put almost all their ink in one or two
 * grey levels (edges add a thin spread); photos spread across many.
 */
export function isPhotoLike(gray: ArrayLike<number>): boolean {
  const bins = new Array<number>(16).fill(0)
  let ink = 0
  for (let i = 0; i < gray.length; i++) {
    const v = gray[i] ?? 255
    if (v >= 230) continue
    ink++
    const b = Math.min(15, Math.floor(v / 16))
    bins[b] = (bins[b] ?? 0) + 1
  }
  if (ink === 0) return false
  return bins.filter((n) => n / ink > 0.04).length >= 6
}

/** The printer copy of a logo: solid for flat artwork, dithered for photos. */
export function logoToRaster(gray: ArrayLike<number>, width: number, height: number): LogoRaster {
  return isPhotoLike(gray) ? ditherToRaster(gray, width, height) : thresholdToRaster(gray, width, height)
}

// ── QR code as a vector path ────────────────────────────────────────────────

/**
 * The QR code for `data` as one SVG path in module units (draw it in a
 * `size × size` viewBox). Screens, react-pdf and Android's HTML all draw the
 * same path; thermal printers use their own QR command instead.
 */
export function qrPath(data: string, margin = 2): { size: number; d: string } {
  const qr = qrcode(0, "M")
  qr.addData(data)
  qr.make()
  const n = qr.getModuleCount()
  let d = ""
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`
    }
  }
  return { size: n + margin * 2, d }
}

/** Standalone SVG markup of a QR code (for HTML strings). */
export function qrSvg(data: string, px: number): string {
  const { size, d } = qrPath(data)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`
}

// ── base64 without atob/Buffer (runs the same on web, Node and Hermes) ──────

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

export function bytesToBase64(bytes: Uint8Array): string {
  let out = ""
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += B64.charAt((n >> 18) & 63) + B64.charAt((n >> 12) & 63)
    out += b === undefined ? "=" : B64.charAt((n >> 6) & 63)
    out += c === undefined ? "=" : B64.charAt(n & 63)
  }
  return out
}

export function base64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/=+$/, "")
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  const at = (i: number) => Math.max(0, B64.indexOf(clean.charAt(i) || "A"))
  let o = 0
  for (let i = 0; i < clean.length; i += 4) {
    const n = (at(i) << 18) | (at(i + 1) << 12) | (at(i + 2) << 6) | at(i + 3)
    if (o < out.length) out[o++] = (n >> 16) & 255
    if (o < out.length) out[o++] = (n >> 8) & 255
    if (o < out.length) out[o++] = n & 255
  }
  return out
}

function base64ByteLength(s: string): number {
  const pad = s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0
  return (s.length / 4) * 3 - pad
}
