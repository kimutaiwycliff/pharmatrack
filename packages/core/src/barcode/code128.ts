// Minimal Code 128 Set B encoder for printing barcode labels (product SKUs
// and GTINs — both are plain printable ASCII, so Set B alone is sufficient;
// no need for Set A/C switching, FNC codes, or Shift). Deliberately hand-rolled
// rather than a dependency: the codebase already hand-rolls GS1 parsing
// (see ./parser.ts) rather than pulling in a barcode library, and a
// canvas/DOM-dependent library like jsbarcode can't compute widths inside
// React Native anyway. Geometry-only output (widths, then bar rects) is used
// instead of a markup string so @react-pdf/renderer's <Svg>/<Rect> — which
// are React elements, not an SVG parser — can consume it directly.
//
// Pattern table verified against two independent sources: Wikipedia's Code
// 128 article and JsBarcode's CODE128/constants.js (github.com/lindell/JsBarcode),
// cross-checked value-by-value for indices 0-106 before being copied here.

// BARS[v] is the 11-module-wide bar/space bitstring for symbol value v
// (0-102), except BARS[106] (STOP) which is 13 modules wide. Index meaning:
// 0-102 = data/check symbol values, 103 = Start A, 104 = Start B, 105 = Start
// C, 106 = Stop. Only Set B (data values 0-94 map 1:1 to ASCII 32-126 via
// `value = charCode - 32`) plus Start B and Stop are used by this encoder;
// values 95-102 (Set B special-function codes) are included only because the
// mod-103 checksum can land on any value 0-102, and the check symbol's bar
// pattern is looked up purely by numeric value regardless of what that value
// means as a data character.
const BARS = [
  "11011001100", "11001101100", "11001100110", "10010011000", "10010001100",
  "10001001100", "10011001000", "10011000100", "10001100100", "11001001000",
  "11001000100", "11000100100", "10110011100", "10011011100", "10011001110",
  "10111001100", "10011101100", "10011100110", "11001110010", "11001011100",
  "11001001110", "11011100100", "11001110100", "11101101110", "11101001100",
  "11100101100", "11100100110", "11101100100", "11100110100", "11100110010",
  "11011011000", "11011000110", "11000110110", "10100011000", "10001011000",
  "10001000110", "10110001000", "10001101000", "10001100010", "11010001000",
  "11000101000", "11000100010", "10110111000", "10110001110", "10001101110",
  "10111011000", "10111000110", "10001110110", "11101110110", "11010001110",
  "11000101110", "11011101000", "11011100010", "11011101110", "11101011000",
  "11101000110", "11100010110", "11101101000", "11101100010", "11100011010",
  "11101111010", "11001000010", "11110001010", "10100110000", "10100001100",
  "10010110000", "10010000110", "10000101100", "10000100110", "10110010000",
  "10110000100", "10011010000", "10011000010", "10000110100", "10000110010",
  "11000010010", "11001010000", "11110111010", "11000010100", "10001111010",
  "10100111100", "10010111100", "10010011110", "10111100100", "10011110100",
  "10011110010", "11110100100", "11110010100", "11110010010", "11011011110",
  "11011110110", "11110110110", "10101111000", "10100011110", "10001011110",
  "10111101000", "10111100010", "11110101000", "11110100010", "10111011110",
  "10111101110", "11101011110", "11110101110", "11010000100", "11010010000",
  "11010011100", "1100011101011",
] as const

const START_B = 104
const STOP = 106
const MODULO = 103
// Set B data range: ASCII 32 (space) through 126 (~), value = charCode - 32.
const MIN_CHAR_CODE = 32
const MAX_CHAR_CODE = 126

// Run-length-encodes a bar/space bitstring ("1"=bar, "0"=space) into a
// sequence of module widths, alternating bar/space and always starting with
// a bar (every Code128 symbol pattern begins with "1" by construction).
function patternToWidths(pattern: string): number[] {
  const widths: number[] = []
  let run = 1
  for (let i = 1; i <= pattern.length; i++) {
    if (i < pattern.length && pattern[i] === pattern[i - 1]) {
      run++
    } else {
      widths.push(run)
      run = 1
    }
  }
  return widths
}

/**
 * Encodes `text` as Code 128 Set B, returning the full symbol's module
 * widths (Start B + one symbol per character + check symbol + Stop),
 * alternating bar/space starting with a bar. Throws if `text` is empty or
 * contains a character outside printable ASCII (32-126) — covers every
 * generated SKU (see ./generate.ts) and manufacturer GTIN this app prints.
 */
export function encodeCode128B(text: string): number[] {
  if (text.length === 0) throw new Error("encodeCode128B: text must not be empty")

  const values: number[] = []
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    if (code < MIN_CHAR_CODE || code > MAX_CHAR_CODE) {
      throw new Error(`encodeCode128B: unsupported character ${JSON.stringify(ch)} (Set B covers ASCII 32-126)`)
    }
    values.push(code - MIN_CHAR_CODE)
  }

  let checksum = START_B
  values.forEach((value, i) => {
    checksum += value * (i + 1)
  })
  checksum %= MODULO

  const symbolValues = [START_B, ...values, checksum, STOP]
  return symbolValues.flatMap((v) => patternToWidths(BARS[v]!))
}

export interface BarcodeRect {
  x: number
  width: number
}

/**
 * Converts module widths (as returned by encodeCode128B) into bar rectangles
 * only (spaces are gaps, not rendered) — geometry consumed identically by a
 * plain DOM <rect> mapping and by @react-pdf/renderer's <Rect>.
 */
export function barsFromWidths(widths: number[], moduleWidth: number): BarcodeRect[] {
  const rects: BarcodeRect[] = []
  let x = 0
  widths.forEach((w, i) => {
    const width = w * moduleWidth
    if (i % 2 === 0) rects.push({ x, width }) // even index = bar, odd = space
    x += width
  })
  return rects
}

/**
 * Convenience wrapper producing a standalone `<svg>...</svg>` string —
 * the one path that genuinely needs a markup string rather than geometry
 * data: mobile's label printing hands raw HTML (including inline SVG) to
 * expo-print, which has no React-element rendering path.
 */
export function barcodeSvgMarkup(
  text: string,
  opts?: { moduleWidth?: number; height?: number; includeText?: boolean },
): string {
  const moduleWidth = opts?.moduleWidth ?? 2
  const height = opts?.height ?? 60
  const includeText = opts?.includeText ?? true
  const textHeight = includeText ? 14 : 0

  const widths = encodeCode128B(text)
  const totalWidth = widths.reduce((sum, w) => sum + w, 0) * moduleWidth
  const rects = barsFromWidths(widths, moduleWidth)

  const barsMarkup = rects.map((r) => `<rect x="${r.x}" y="0" width="${r.width}" height="${height}" fill="#000"/>`).join("")
  const textMarkup = includeText
    ? `<text x="${totalWidth / 2}" y="${height + 11}" font-family="monospace" font-size="11" text-anchor="middle">${text}</text>`
    : ""

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height + textHeight}" viewBox="0 0 ${totalWidth} ${height + textHeight}">${barsMarkup}${textMarkup}</svg>`
}
