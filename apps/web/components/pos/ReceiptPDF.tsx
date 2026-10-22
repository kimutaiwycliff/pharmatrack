"use client"

import { Document, Font, Page, Text, View, Image, Svg, Path, Rect, StyleSheet } from "@react-pdf/renderer"
import {
  formatKES, qrPath, receiptFooterLines, receiptHeaderLines, receiptQtyText,
  type PaperWidth, type ReceiptDoc,
} from "@pharmatrack/core"

// The receipt as a PDF (Download in the receipt dialog) — drawn from the same
// ReceiptDoc as the screen and the thermal printer, so Settings → Receipt
// applies here too.

// Receipt lines wrap at word boundaries like the printer — never "war-ranty".
Font.registerHyphenationCallback((word) => [word])

const styles = StyleSheet.create({
  page: { padding: "6mm", fontFamily: "Courier", fontSize: 8.5, color: "#000" },
  center: { textAlign: "center" },
  muted: { color: "#444" },
  bold: { fontFamily: "Courier-Bold" },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 1.5 },
  divider: { borderBottomWidth: 1, borderBottomColor: "#666", borderBottomStyle: "dashed", marginVertical: 5 },
  total: { fontFamily: "Courier-Bold", fontSize: 10 },
  logo: { maxHeight: 48, maxWidth: "70%", objectFit: "contain", alignSelf: "center", marginBottom: 4 },
})

// 1mm = 2.8346pt. 58mm and 80mm are the two common thermal roll widths.
const PAPER_WIDTH_PT: Record<PaperWidth, number> = { "58mm": 164.4, "80mm": 226.77 }

function Pair({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={strong ? styles.total : styles.muted}>{label}</Text>
      <Text style={strong ? styles.total : undefined}>{value}</Text>
    </View>
  )
}

/** A rough page height so short receipts aren't followed by a metre of blank paper. */
function pageHeight(doc: ReceiptDoc): number {
  const lines = 14 + receiptHeaderLines(doc).length + receiptFooterLines(doc).length + doc.lines.length * 2.4
  return Math.max(260, lines * 12 + (doc.logoDataUrl ? 56 : 0) + (doc.qrData ? 110 : 0) + 40)
}

export function ReceiptPDFDocument({ doc, paperWidth = "80mm" }: { doc: ReceiptDoc; paperWidth?: PaperWidth }) {
  const qr = doc.qrData ? qrPath(doc.qrData) : null
  return (
    <Document title={`Receipt ${doc.receiptNumber}`}>
      <Page size={[PAPER_WIDTH_PT[paperWidth], pageHeight(doc)]} style={styles.page}>
        <View style={styles.center}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
          {doc.logoDataUrl && <Image src={doc.logoDataUrl} style={styles.logo} />}
          <Text style={[styles.bold, { fontSize: 10.5, letterSpacing: 1 }]}>{doc.shopName.toUpperCase()}</Text>
          {receiptHeaderLines(doc).map((l, i) => <Text key={i} style={styles.muted}>{l}</Text>)}
        </View>

        <View style={styles.divider} />
        <Pair label="Receipt" value={doc.receiptNumber} />
        <Pair label="Date" value={doc.dateText} />
        {doc.cashier && <Pair label="Served by" value={doc.cashier} />}
        {doc.customer && <Pair label="Customer" value={doc.customer} />}

        <View style={styles.divider} />
        {doc.lines.map((l, i) => (
          <View key={i} style={{ marginBottom: 2 }}>
            <Text style={styles.bold}>{l.name}</Text>
            <Pair label={`  ${receiptQtyText(l)}`} value={formatKES(l.totalCents)} />
            {l.discountCents ? <Pair label="  Discount" value={`-${formatKES(l.discountCents)}`} /> : null}
          </View>
        ))}

        <View style={styles.divider} />
        {doc.discountCents > 0 && <Pair label="Subtotal" value={formatKES(doc.subtotalCents)} />}
        {doc.discountCents > 0 && <Pair label="Discount" value={`-${formatKES(doc.discountCents)}`} />}
        <Pair label="TOTAL" value={formatKES(doc.totalCents)} strong />
        <Pair label={`Paid (${doc.paymentLabel})`} value={formatKES(doc.paidCents ?? doc.totalCents)} />
        {doc.changeCents ? <Pair label="Change" value={formatKES(doc.changeCents)} /> : null}
        {doc.mpesaReference && <Pair label="M-Pesa ref" value={doc.mpesaReference} />}

        {receiptFooterLines(doc).length > 0 && (
          <>
            <View style={styles.divider} />
            {receiptFooterLines(doc).map((l, i) => <Text key={i} style={styles.center}>{l}</Text>)}
          </>
        )}

        {qr && (
          <View style={{ alignItems: "center", marginTop: 8 }}>
            <Svg width={80} height={80} viewBox={`0 0 ${qr.size} ${qr.size}`}>
              <Rect x={0} y={0} width={qr.size} height={qr.size} fill="#fff" />
              <Path d={qr.d} fill="#000" />
            </Svg>
            {doc.qrCaption && <Text style={[styles.center, styles.muted, { marginTop: 2 }]}>{doc.qrCaption}</Text>}
          </View>
        )}
      </Page>
    </Document>
  )
}
