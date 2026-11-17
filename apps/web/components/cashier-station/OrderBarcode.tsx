"use client"

import { barsFromWidths, encodeCode128B } from "@pharmatrack/core"

// The order number as a Code128 barcode: the cashier's USB scanner reads it
// straight into the station's search box (it types "A-047" + Enter).
export function OrderBarcode({ text, height = 56, moduleWidth = 2 }: { text: string; height?: number; moduleWidth?: number }) {
  const widths = encodeCode128B(text)
  const total = widths.reduce((s, w) => s + w, 0) * moduleWidth
  return (
    <svg width={total} height={height} viewBox={`0 0 ${total} ${height}`} role="img" aria-label={`Barcode ${text}`}>
      <rect width={total} height={height} fill="#fff" />
      {barsFromWidths(widths, moduleWidth).map((r, i) => <rect key={i} x={r.x} y={0} width={r.width} height={height} fill="#000" />)}
    </svg>
  )
}
