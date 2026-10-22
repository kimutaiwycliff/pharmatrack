// ESC/POS byte builder for thermal receipt printers (Epson TM, Xprinter,
// Rongta, Gprinter, generic POS-58/80, Sunmi's raw channel). Every client —
// web (Web Serial), Android (Bluetooth/USB/LAN/Sunmi) and desktop (Tauri) —
// sends the bytes this produces; only the transport differs.
//
// Only commands every one of those families supports are used. Text is sent
// in code page PC437 after folding characters it can't print (×, –, ’, é…)
// to plain ASCII, so a cheap printer never prints garbage.

const ESC = 0x1b
const GS = 0x1d
const DLE = 0x10
const EOT = 0x04
const LF = 0x0a

export type Align = "left" | "center" | "right"

// Characters receipts use that PC437 can't print, folded to ASCII.
const FOLD: Record<string, string> = {
  "×": "x", "–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "•": "*", "…": "...", "·": ".",
  "€": "EUR", "£": "GBP", "©": "(c)", "®": "(R)", "™": "TM", "°": "o", "µ": "u", "½": "1/2", "¼": "1/4", " ": " ",
}

/** Text a basic thermal printer can print: folded to printable ASCII. */
export function toPrinterText(s: string): string {
  return Array.from(s)
    .map((ch) => {
      if (FOLD[ch] !== undefined) return FOLD[ch]
      const code = ch.charCodeAt(0)
      if ((code >= 0x20 && code <= 0x7e) || ch === "\n") return ch
      // Accented letters (é → e): drop the combining marks after decomposing.
      const base = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "")
      return /^[\x20-\x7e]+$/.test(base) ? base : "?"
    })
    .join("")
}

/** Chainable builder: `new EscPos().init().align("center").text("Hi").cut().bytes()`. */
export class EscPos {
  private out: number[] = []

  private push(...b: number[]): this {
    for (const x of b) this.out.push(x)
    return this
  }

  /** ESC @ — reset to defaults; ESC t 0 — code page PC437. */
  init(): this {
    return this.push(ESC, 0x40, ESC, 0x74, 0x00)
  }

  align(a: Align): this {
    return this.push(ESC, 0x61, a === "left" ? 0 : a === "center" ? 1 : 2)
  }

  bold(on: boolean): this {
    return this.push(ESC, 0x45, on ? 1 : 0)
  }

  /** GS ! — character width/height multiplier, 1–8 each. */
  size(width = 1, height = 1): this {
    const w = Math.min(8, Math.max(1, Math.round(width))) - 1
    const h = Math.min(8, Math.max(1, Math.round(height))) - 1
    return this.push(GS, 0x21, (w << 4) | h)
  }

  text(s: string): this {
    for (const ch of toPrinterText(s)) this.out.push(ch.charCodeAt(0))
    return this
  }

  line(s = ""): this {
    return this.text(s).push(LF)
  }

  /** ESC d n — print and feed n lines. */
  feed(lines = 1): this {
    return this.push(ESC, 0x64, Math.min(255, Math.max(0, lines)))
  }

  /** GS V 66 n — feed to the cutter, then partial cut (ignored by printers without one). */
  cut(): this {
    return this.push(GS, 0x56, 0x42, 0x03)
  }

  /** ESC p 0 t1 t2 — pulse the cash drawer on pin 2. */
  openDrawer(): this {
    return this.push(ESC, 0x70, 0x00, 0x19, 0xfa)
  }

  /** GS ( k — QR code (model 2), module size 1–16, error correction M. */
  qr(data: string, moduleSize = 6): this {
    const bytes = Array.from(new TextEncoder().encode(data))
    const len = bytes.length + 3
    const size = Math.min(16, Math.max(1, moduleSize))
    return this.push(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00) // model 2
      .push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, size) // module size
      .push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31) // error correction M
      .push(GS, 0x28, 0x6b, len & 0xff, (len >> 8) & 0xff, 0x31, 0x50, 0x30, ...bytes) // store
      .push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30) // print
  }

  /**
   * GS v 0 — a 1-bit raster image (rows packed MSB-first, 1 = black), sent in
   * bands of 48 rows: cheap printers drop or garble one tall image command.
   */
  raster(width: number, height: number, data: ArrayLike<number>): this {
    const rowBytes = Math.ceil(width / 8)
    const BAND = 48
    for (let y0 = 0; y0 < height; y0 += BAND) {
      const h = Math.min(BAND, height - y0)
      this.push(GS, 0x76, 0x30, 0x00, rowBytes & 0xff, (rowBytes >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff)
      for (let i = y0 * rowBytes; i < (y0 + h) * rowBytes; i++) this.out.push(data[i] ?? 0)
    }
    return this
  }

  /** Raw bytes, for anything not covered above. */
  raw(b: ArrayLike<number>): this {
    for (let i = 0; i < b.length; i++) this.out.push(b[i]!)
    return this
  }

  bytes(): Uint8Array {
    return Uint8Array.from(this.out)
  }
}

/**
 * DLE EOT n — real-time status request. n: 1 printer, 2 offline cause,
 * 3 error cause, 4 paper roll sensor. The printer answers with one byte
 * (see parsePrinterStatus in ./status). Many cheap units never answer.
 */
export function statusRequest(n: 1 | 2 | 3 | 4): Uint8Array {
  return Uint8Array.of(DLE, EOT, n)
}
