"use client"

import { Document, Page, Text, View, StyleSheet, Svg, Rect } from "@react-pdf/renderer"
import { encodeCode128B, barsFromWidths } from "@pharmatrack/core"

export interface LabelItem {
  code: string
  productName: string
  price?: number | null
  copies: number
}

export type LabelSize = "40x30mm" | "50x30mm"

// 1mm = 2.8346pt — same conversion ReceiptPDF.tsx uses for thermal paper widths.
const MM_TO_PT = 2.8346
const LABEL_SIZE_PT: Record<LabelSize, { width: number; height: number }> = {
  "40x30mm": { width: 40 * MM_TO_PT, height: 30 * MM_TO_PT },
  "50x30mm": { width: 50 * MM_TO_PT, height: 30 * MM_TO_PT },
}

const MAX_MODULE_WIDTH = 1.6

function kes(n: number) {
  return `KES ${n.toFixed(2)}`
}

function Barcode({ code, maxWidth, height }: { code: string; maxWidth: number; height: number }) {
  const widths = encodeCode128B(code)
  const totalModules = widths.reduce((a, b) => a + b, 0)
  const moduleWidth = Math.min(MAX_MODULE_WIDTH, maxWidth / totalModules)
  const rects = barsFromWidths(widths, moduleWidth)
  const barcodeWidth = totalModules * moduleWidth
  return (
    <Svg width={barcodeWidth} height={height}>
      {rects.map((r, i) => (
        <Rect key={i} x={r.x} y={0} width={r.width} height={height} fill="#000" />
      ))}
    </Svg>
  )
}

const singleStyles = StyleSheet.create({
  page: { padding: 4, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 7, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 2 },
  price: { fontSize: 7, marginTop: 2 },
  code: { fontSize: 7, fontFamily: "Courier", marginTop: 1, letterSpacing: 0.5 },
})

function SingleLabel({ item, width }: { item: LabelItem; width: number }) {
  const maxBarcodeWidth = width - 12 // horizontal margin
  return (
    <View style={singleStyles.page} wrap={false}>
      <Text style={singleStyles.name}>{item.productName}</Text>
      <Barcode code={item.code} maxWidth={maxBarcodeWidth} height={34} />
      <Text style={singleStyles.code}>{item.code}</Text>
      {item.price != null && <Text style={singleStyles.price}>{kes(item.price)}</Text>}
    </View>
  )
}

/**
 * One page per label copy, sized to the pharmacy's chosen label stock
 * (org_settings.label_size) — feed to a connected label printer via the OS
 * print dialog (window.print()) or a PDF download. Mirrors ReceiptPDF.tsx's
 * mm→pt Page-sizing pattern.
 */
export function SingleLabelDocument({ items, labelSize }: { items: LabelItem[]; labelSize: LabelSize }) {
  const { width, height } = LABEL_SIZE_PT[labelSize]
  const pages = items.flatMap((item, itemIndex) =>
    Array.from({ length: Math.max(1, item.copies) }, (_, copyIndex) => (
      <Page key={`${itemIndex}-${copyIndex}`} size={[width, height]} style={{ padding: 0 }}>
        <SingleLabel item={item} width={width} />
      </Page>
    )),
  )
  return <Document>{pages}</Document>
}

const sheetStyles = StyleSheet.create({
  page: { padding: 18, flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: 130,
    height: 90,
    margin: 4,
    padding: 6,
    borderWidth: 0.5,
    borderColor: "#999",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 6.5, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 2 },
  code: { fontSize: 6.5, fontFamily: "Courier", marginTop: 1 },
})

/**
 * A grid of labels on one or more A4 sheets — for pharmacies without a
 * dedicated label printer, printed on adhesive label paper (or plain paper,
 * cut by hand) via any ordinary printer. react-pdf auto-paginates additional
 * A4 pages once the flex-wrapped grid overflows one page, so no manual
 * page-count math is needed here.
 */
export function LabelSheetDocument({ items }: { items: LabelItem[] }) {
  const cells = items.flatMap((item, itemIndex) =>
    Array.from({ length: Math.max(1, item.copies) }, (_, copyIndex) => (
      <View key={`${itemIndex}-${copyIndex}`} style={sheetStyles.cell} wrap={false}>
        <Text style={sheetStyles.name}>{item.productName}</Text>
        <Barcode code={item.code} maxWidth={110} height={28} />
        <Text style={sheetStyles.code}>{item.code}</Text>
      </View>
    )),
  )
  return (
    <Document>
      <Page size="A4" style={sheetStyles.page}>
        {cells}
      </Page>
    </Document>
  )
}
