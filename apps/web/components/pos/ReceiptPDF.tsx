"use client"

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import type { Sale, SaleItem } from "@pharmatrack/types"

const styles = StyleSheet.create({
  page: { padding: "8mm", fontFamily: "Courier", fontSize: 9, color: "#000" },
  center: { textAlign: "center", marginBottom: 4 },
  bold: { fontFamily: "Courier-Bold" },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  divider: { borderBottomWidth: 1, borderBottomColor: "#666", borderBottomStyle: "dashed", marginVertical: 6 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  totalText: { fontFamily: "Courier-Bold", fontSize: 10 },
  footer: { textAlign: "center", marginTop: 8, color: "#555" },
})

interface Props {
  sale: Sale
  items: SaleItem[]
  orgName: string
  branchName: string
  branchAddress: string | null
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-KE", {
    timeZone: "Africa/Nairobi",
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

function kes(n: number) {
  return `KES ${n.toFixed(2)}`
}

export function ReceiptPDFDocument({ sale, items, orgName, branchName, branchAddress }: Props) {
  return (
    <Document>
      <Page size={[226.77, 841.89]} style={styles.page}>
        <View style={styles.center}>
          <Text style={[styles.bold, { fontSize: 11, letterSpacing: 1 }]}>{orgName.toUpperCase()}</Text>
          <Text style={{ letterSpacing: 0.5 }}>{branchName.toUpperCase()}</Text>
          {branchAddress && <Text style={{ color: "#555" }}>{branchAddress}</Text>}
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={{ color: "#555" }}>Receipt</Text>
          <Text style={styles.bold}>{sale.receipt_number}</Text>
        </View>
        <View style={styles.row}>
          <Text style={{ color: "#555" }}>Date</Text>
          <Text>{fmt(sale.created_at)}</Text>
        </View>

        <View style={styles.divider} />

        {items.map((item) => (
          <View key={item.id} style={styles.row}>
            <Text style={{ maxWidth: 130 }}>
              {item.product_name} × {item.quantity} {item.base_unit}
            </Text>
            <Text>{kes(item.line_total)}</Text>
          </View>
        ))}

        <View style={styles.divider} />

        {sale.discount_amount > 0 && (
          <View style={styles.row}>
            <Text style={{ color: "#555" }}>Discount</Text>
            <Text>- {kes(sale.discount_amount)}</Text>
          </View>
        )}

        <View style={styles.totalRow}>
          <Text style={styles.totalText}>TOTAL</Text>
          <Text style={styles.totalText}>{kes(sale.total_amount)}</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={{ color: "#555" }}>Paid</Text>
          <Text style={styles.bold}>{sale.payment_method.toUpperCase()}</Text>
        </View>
        {sale.mpesa_reference && (
          <View style={styles.row}>
            <Text style={{ color: "#555" }}>Ref</Text>
            <Text>{sale.mpesa_reference}</Text>
          </View>
        )}
        {sale.change_given != null && sale.change_given > 0 && (
          <View style={styles.row}>
            <Text style={{ color: "#555" }}>Change</Text>
            <Text>{kes(sale.change_given)}</Text>
          </View>
        )}

        <View style={styles.divider} />
        <Text style={styles.footer}>Thank you for your business</Text>
      </Page>
    </Document>
  )
}
