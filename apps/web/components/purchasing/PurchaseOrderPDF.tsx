// No "use client": rendered both in the browser (Download PDF) and on the
// server (emailing the PO to the supplier via renderToBuffer).
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"

export interface PoPdfOrg {
  name: string
  registration_number?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
}

export interface PoPdfOrder {
  po_number: string
  status: string
  created_at: string
  sent_at: string | null
  expected_date: string | null
  notes: string | null
  branch_name: string | null
  supplier_name: string | null
  supplier_phone: string | null
  supplier_email: string | null
  created_by_name: string | null
  items: Array<{
    product_name: string
    product_strength: string | null
    pack_label: string | null
    units_per_pack: number
    base_unit?: string | null
    quantity_ordered: number
    unit_cost: number | null
  }>
}

const GREEN = "#0f7a4a"
const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9.5, fontFamily: "Helvetica", color: "#111" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  org: { fontSize: 15, fontFamily: "Helvetica-Bold", color: GREEN },
  muted: { color: "#555" },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", textAlign: "right" },
  poNo: { fontSize: 11, textAlign: "right", marginTop: 2 },
  boxes: { flexDirection: "row", gap: 12, marginBottom: 16 },
  box: { flex: 1, borderWidth: 1, borderColor: "#ddd", borderRadius: 4, padding: 8 },
  boxLabel: { fontSize: 7.5, color: "#777", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 },
  bold: { fontFamily: "Helvetica-Bold" },
  th: { flexDirection: "row", backgroundColor: "#f1f5f3", borderBottomWidth: 1, borderBottomColor: "#cfd8d3", paddingVertical: 5, paddingHorizontal: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e5e5e5", paddingVertical: 5, paddingHorizontal: 4 },
  cNo: { width: 22 },
  cItem: { flex: 1, paddingRight: 6 },
  cPack: { width: 90 },
  cQty: { width: 44, textAlign: "right" },
  cCost: { width: 70, textAlign: "right" },
  cTotal: { width: 78, textAlign: "right" },
  totalRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 8 },
  totalBox: { width: 200, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1.5, borderTopColor: "#111", paddingTop: 6 },
  notes: { marginTop: 18, padding: 8, backgroundColor: "#fafafa", borderRadius: 4 },
  sign: { flexDirection: "row", gap: 24, marginTop: 36 },
  signLine: { flex: 1, borderTopWidth: 1, borderTopColor: "#999", paddingTop: 4, color: "#666", fontSize: 8 },
  footer: { position: "absolute", bottom: 20, left: 36, right: 36, fontSize: 7.5, color: "#888", textAlign: "center" },
})

const kes = (n: number) => `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", year: "numeric" }) : "—"

export function PurchaseOrderPDFDocument({ order, org, showPrices }: { order: PoPdfOrder; org: PoPdfOrg; showPrices: boolean }) {
  const priced = showPrices && order.items.some((i) => i.unit_cost != null)
  const total = order.items.reduce((sum, i) => sum + (i.unit_cost ?? 0) * i.quantity_ordered, 0)
  return (
    <Document title={`${order.po_number} — ${org.name}`}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.org}>{org.name}</Text>
            {org.address && <Text style={s.muted}>{org.address}</Text>}
            {(org.phone || org.email) && <Text style={s.muted}>{[org.phone, org.email].filter(Boolean).join(" · ")}</Text>}
            {org.registration_number && <Text style={s.muted}>PPB Reg: {org.registration_number}</Text>}
          </View>
          <View>
            <Text style={s.title}>PURCHASE ORDER</Text>
            <Text style={s.poNo}>{order.po_number}</Text>
            <Text style={[s.muted, { textAlign: "right", marginTop: 2 }]}>Date: {day(order.sent_at ?? order.created_at)}</Text>
          </View>
        </View>

        <View style={s.boxes}>
          <View style={s.box}>
            <Text style={s.boxLabel}>Supplier</Text>
            <Text style={s.bold}>{order.supplier_name ?? "—"}</Text>
            {order.supplier_phone && <Text>{order.supplier_phone}</Text>}
            {order.supplier_email && <Text>{order.supplier_email}</Text>}
          </View>
          <View style={s.box}>
            <Text style={s.boxLabel}>Deliver to</Text>
            <Text style={s.bold}>{org.name}{order.branch_name ? ` — ${order.branch_name}` : ""}</Text>
            {org.address && <Text>{org.address}</Text>}
            {org.phone && <Text>{org.phone}</Text>}
          </View>
          <View style={s.box}>
            <Text style={s.boxLabel}>Expected delivery</Text>
            <Text style={s.bold}>{day(order.expected_date)}</Text>
            {order.created_by_name && <Text style={[s.muted, { marginTop: 4 }]}>Ordered by {order.created_by_name}</Text>}
          </View>
        </View>

        <View style={s.th}>
          <Text style={[s.cNo, s.bold]}>#</Text>
          <Text style={[s.cItem, s.bold]}>Item</Text>
          <Text style={[s.cPack, s.bold]}>Pack</Text>
          <Text style={[s.cQty, s.bold]}>Qty</Text>
          {priced && <Text style={[s.cCost, s.bold]}>Unit cost</Text>}
          {priced && <Text style={[s.cTotal, s.bold]}>Amount</Text>}
        </View>
        {order.items.map((i, idx) => (
          <View key={idx} style={s.tr} wrap={false}>
            <Text style={s.cNo}>{idx + 1}</Text>
            <Text style={s.cItem}>{i.product_name}{i.product_strength ? ` ${i.product_strength}` : ""}</Text>
            <Text style={s.cPack}>
              {i.pack_label ?? (i.units_per_pack > 1 ? `Pack of ${i.units_per_pack}` : i.base_unit ?? "Unit")}
            </Text>
            <Text style={s.cQty}>{i.quantity_ordered}</Text>
            {priced && <Text style={s.cCost}>{i.unit_cost == null ? "—" : kes(i.unit_cost)}</Text>}
            {priced && <Text style={s.cTotal}>{i.unit_cost == null ? "—" : kes(i.unit_cost * i.quantity_ordered)}</Text>}
          </View>
        ))}

        {priced && (
          <View style={s.totalRow}>
            <View style={s.totalBox}>
              <Text style={s.bold}>Estimated total</Text>
              <Text style={s.bold}>{kes(total)}</Text>
            </View>
          </View>
        )}

        {order.notes && (
          <View style={s.notes}>
            <Text style={s.boxLabel}>Notes</Text>
            <Text>{order.notes}</Text>
          </View>
        )}

        <View style={s.sign}>
          <Text style={s.signLine}>Authorised by</Text>
          <Text style={s.signLine}>Supplier confirmation</Text>
        </View>

        <Text style={s.footer} fixed>
          {order.po_number} · Please quote this PO number on your invoice and delivery note · Generated by PharmaTrack
        </Text>
      </Page>
    </Document>
  )
}
