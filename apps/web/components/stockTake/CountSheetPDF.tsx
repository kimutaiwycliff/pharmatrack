import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import type { StockTakeItem } from "@/lib/stockTake/server"

// A printable A4 count sheet for one stock-take shelf (ADR-020), in the same
// order as the screen, for pharmacies that count on paper first and type the
// numbers in afterwards. One row per known batch plus a blank row for a batch
// found on the shelf. Recorded quantities only when the session shows them.

const s = StyleSheet.create({
  page: { padding: 28, paddingBottom: 40, fontSize: 9, fontFamily: "Helvetica", color: "#111827" },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  meta: { fontSize: 9, color: "#6b7280", marginTop: 3, marginBottom: 10 },
  sign: { flexDirection: "row", marginBottom: 12 },
  signBox: { flex: 1, marginRight: 18, borderBottomWidth: 0.5, borderColor: "#9ca3af", paddingBottom: 12, fontSize: 8, color: "#6b7280" },
  group: { fontSize: 9, fontFamily: "Helvetica-Bold", backgroundColor: "#f0fdf4", color: "#166534", paddingVertical: 3, paddingHorizontal: 4, marginTop: 8 },
  head: { flexDirection: "row", borderBottomWidth: 0.75, borderColor: "#111827", paddingVertical: 3, fontFamily: "Helvetica-Bold", fontSize: 8 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#d1d5db", minHeight: 20, alignItems: "center" },
  product: { flex: 3.2, paddingRight: 4 },
  sub: { color: "#6b7280", fontSize: 7.5 },
  batch: { flex: 1.3, paddingRight: 4 },
  expiry: { flex: 1, paddingRight: 4 },
  recorded: { flex: 0.9, textAlign: "right", paddingRight: 6 },
  box: { flex: 1, borderLeftWidth: 0.5, borderColor: "#d1d5db", height: 20 },
  boxHead: { flex: 1, paddingLeft: 4 },
  footer: { position: "absolute", bottom: 16, left: 28, right: 28, fontSize: 7.5, color: "#9ca3af", flexDirection: "row", justifyContent: "space-between" },
})

const month = (d: string) => new Date(`${d.slice(0, 7)}-15T12:00:00+03:00`).toLocaleDateString("en-KE", { month: "short", year: "numeric" })

export function CountSheetDocument({ title, items, showRecorded, setup }: {
  title: string; items: StockTakeItem[]; showRecorded: boolean; setup: boolean
}) {
  const groups = new Map<string, StockTakeItem[]>()
  for (const i of items) groups.set(i.group, [...(groups.get(i.group) ?? []), i])
  const today = new Date().toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "long", year: "numeric" })
  const packCol = (i: StockTakeItem) => (i.unitsPerPack > 1 ? `${i.unitsPerPack} ${i.baseUnit}s per pack` : `count in ${i.baseUnit}s`)

  return (
    <Document title={`Count sheet — ${title}`}>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>Count sheet: {title}</Text>
        <Text style={s.meta}>Printed {today} · {items.length} products. Write what is on the shelf, then type it into PharmaTrack.</Text>
        <View style={s.sign}>
          <Text style={s.signBox}>Counted by</Text>
          <Text style={s.signBox}>Date</Text>
          <Text style={s.signBox}>Checked by</Text>
        </View>
        <View style={s.head} fixed>
          <Text style={s.product}>Product</Text>
          <Text style={s.batch}>Batch</Text>
          <Text style={s.expiry}>Expiry</Text>
          {showRecorded && <Text style={s.recorded}>Recorded</Text>}
          <Text style={s.boxHead}>Full packs</Text>
          <Text style={s.boxHead}>Loose</Text>
          {setup && <Text style={s.boxHead}>Price (KES)</Text>}
        </View>
        {[...groups.entries()].map(([group, list]) => (
          <View key={group}>
            <Text style={s.group} minPresenceAhead={40}>{group}</Text>
            {list.map((i) => {
              const rows = [
                ...i.batches.map((b) => ({ key: b.id, batch: b.batchNumber, expiry: month(b.expiry), qty: b.qty })),
                { key: "new", batch: "", expiry: "", qty: null as number | null },
              ]
              return rows.map((r, idx) => (
                <View key={`${i.key}-${r.key}`} style={s.row} wrap={false}>
                  <View style={s.product}>
                    {idx === 0 ? (
                      <>
                        <Text>{i.name}{i.controlled ? "  (controlled)" : ""}</Text>
                        <Text style={s.sub}>{[i.detail, packCol(i)].filter(Boolean).join(" · ")}</Text>
                      </>
                    ) : <Text style={s.sub}>{r.key === "new" ? "Other batch on shelf" : ""}</Text>}
                  </View>
                  <Text style={s.batch}>{r.batch}</Text>
                  <Text style={s.expiry}>{r.expiry}</Text>
                  {showRecorded && <Text style={s.recorded}>{r.qty ?? ""}</Text>}
                  <View style={s.box} />
                  <View style={s.box} />
                  {setup && <View style={s.box} />}
                </View>
              ))
            })}
          </View>
        ))}
        <View style={s.footer} fixed>
          <Text>PharmaTrack stock take</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
