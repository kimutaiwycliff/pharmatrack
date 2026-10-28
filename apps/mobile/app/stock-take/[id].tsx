import Ionicons from "@expo/vector-icons/Ionicons"
import { FlashList } from "@shopify/flash-list"
import { router, useLocalSearchParams } from "expo-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Pressable, StyleSheet, View } from "react-native"
import type { BarcodeScanEvent } from "@pharmatrack/core"
import {
  Button, Card, DateField, ErrorState, HardwareScanCatcher, IconButton, Screen, ScreenHeader, Sheet, SkeletonList, Text, TextField, useIsOnline,
} from "../../src/components"
import { errorMessage } from "../../src/lib/api"
import { captureScan } from "../../src/lib/scanCapture"
import { scanFields } from "../../src/lib/stock/scan-fields"
import { toast } from "../../src/lib/toast"
import {
  changeSession, enqueue, flushQueue, getQueue, loadSession, postSession, previewSession, searchSession, type Preview,
} from "../../src/features/stockTake/data"
import {
  amountLabel, countedOf, hydrate, queueSize, toLine, type Draft, type LinePayload, type Price, type SessionData, type StockTakeItem,
} from "../../src/features/stockTake/logic"
import { useTheme } from "../../src/theme/useTheme"
import { radius, space } from "../../src/theme/tokens"

// Counting one shelf on Android (ADR-020) — the twin of the web count screen
// (apps/web/components/stockTake/CountSheet.tsx). Every change goes into the
// phone's queue first (data.ts) and is sent when there's a connection, so a
// shelf can be counted in a back room with no signal. Review and posting need
// the internet.

type Row = { type: "group"; key: string; title: string; done: number; total: number } | { type: "item"; key: string; item: StockTakeItem }

let flushTimer: ReturnType<typeof setTimeout> | null = null
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
const monthLabel = (iso: string) => new Date(`${iso.slice(0, 7)}-15T12:00:00+03:00`).toLocaleDateString("en-KE", { month: "short", year: "numeric" })
const newId = () => globalThis.crypto?.randomUUID?.() ?? "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/[x]/g, () => ((Math.random() * 16) | 0).toString(16))

export default function CountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const theme = useTheme()
  const online = useIsOnline()
  const [all, setAll] = useState(false)
  const [state, setState] = useState<{ data: SessionData; offline: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [prices, setPrices] = useState<Record<string, Price>>({})
  const [barcodes, setBarcodes] = useState<Record<string, string>>({})
  const [extra, setExtra] = useState<StockTakeItem[]>([])
  const [pending, setPending] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filter, setFilter] = useState("")

  // Load (server, or the cached copy offline), then lay anything still
  // waiting in the phone's queue over what the server has.
  const fetchAll = useCallback(async (withAll: boolean) => {
    const r = await loadSession(id, withAll)
    return { r, q: await getQueue(id) }
  }, [id])
  const apply = useCallback(({ r, q }: Awaited<ReturnType<typeof fetchAll>>, first: boolean) => {
    setState(r)
    setError(null)
    if (!first) return
    const h = hydrate(r.data)
    const queued = hydrate({ items: r.data.items, lines: Object.values(q.lines).map((l) => ({ ...l, expected_qty: null })) })
    for (const d of q.deletes) delete h.drafts[d]
    setDrafts({ ...h.drafts, ...queued.drafts })
    setPrices({ ...h.prices, ...queued.prices })
    setBarcodes({ ...h.barcodes, ...queued.barcodes })
    setPending(queueSize(q))
  }, [])
  const fail = useCallback((err: unknown) => setError(errorMessage(err, "Couldn't open this count.")), [])
  const load = (withAll: boolean, first: boolean) => fetchAll(withAll).then((x) => apply(x, first)).catch(fail)
  useEffect(() => {
    fetchAll(false).then((x) => apply(x, true)).catch(fail)
  }, [fetchAll, apply, fail])

  const flushSoon = useCallback(() => {
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = setTimeout(() => {
      flushQueue(id).then(setPending).catch((err) => toast.error(errorMessage(err, "This count is already finished.")))
    }, 800)
  }, [id])
  useEffect(() => { if (online) flushSoon() }, [online, flushSoon])

  const data = state?.data
  const items = useMemo(() => {
    const base = data?.items ?? []
    const have = new Set(base.map((i) => i.key))
    return [...extra.filter((i) => !have.has(i.key)), ...base]
  }, [data, extra])
  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items])
  const linesOf = useMemo(() => {
    const m = new Map<string, Draft[]>()
    for (const d of Object.values(drafts)) m.set(d.itemKey, [...(m.get(d.itemKey) ?? []), d])
    return m
  }, [drafts])
  const isCounted = useCallback((i: StockTakeItem) => (linesOf.get(i.key) ?? []).some((d) => countedOf(d, i.unitsPerPack) != null), [linesOf])
  const status = data?.session.status
  const readOnly = status === "posted" || status === "cancelled"
  const setup = data?.session.kind === "setup"
  const showExpected = !!data && !(data.session.hide_expected && status === "draft")

  // Queue changed drafts (and deleted line ids), then send soon.
  async function save(changed: Draft[], deleted: string[], nextPrices = prices, nextBarcodes = barcodes) {
    const lines: LinePayload[] = []
    const dels = [...deleted]
    for (const d of changed) {
      const r = toLine(d, byKey.get(d.itemKey), nextPrices[d.itemKey], nextBarcodes[d.itemKey])
      if (r.kind === "save") lines.push(r.line)
      else if (r.kind === "delete") dels.push(d.id)
    }
    if (!lines.length && !dels.length) return
    setPending(await enqueue(id, lines, dels))
    flushSoon()
  }
  function change(d: Draft) {
    const real = d.id.startsWith("new-") ? { ...d, id: newId() } : d
    setDrafts((prev) => ({ ...prev, [real.id]: real }))
    void save([real], [])
  }
  function batchDraft(item: StockTakeItem, batchId: string): Draft {
    return (linesOf.get(item.key) ?? []).find((d) => d.batchId === batchId) ?? {
      id: `new-${batchId}`, itemKey: item.key, productId: item.productId, catalogId: item.productId ? null : item.catalogId,
      batchId, batchNumber: "", expiry: "", packs: "", loose: "",
    }
  }
  function addBatch(item: StockTakeItem, prefill?: { batchNumber?: string; expiry?: string }) {
    const d: Draft = {
      id: newId(), itemKey: item.key, productId: item.productId, catalogId: item.productId ? null : item.catalogId,
      batchId: null, batchNumber: prefill?.batchNumber ?? "", expiry: prefill?.expiry ?? "", packs: "", loose: "",
    }
    setDrafts((prev) => ({ ...prev, [d.id]: d }))
  }
  function remove(d: Draft) {
    setDrafts((prev) => { const n = { ...prev }; delete n[d.id]; return n })
    void save([], [d.id])
  }
  function none(item: StockTakeItem) {
    const found = (linesOf.get(item.key) ?? []).filter((d) => !d.batchId)
    const zeros = item.batches.map((b) => { const d = batchDraft(item, b.id); return { ...d, id: d.id.startsWith("new-") ? newId() : d.id, packs: "0", loose: "" } })
    setDrafts((prev) => { const n = { ...prev }; for (const f of found) delete n[f.id]; for (const z of zeros) n[z.id] = z; return n })
    void save(zeros, found.map((f) => f.id))
  }
  function setPrice(item: StockTakeItem, p: Price) {
    const next = { ...prices, [item.key]: p }
    setPrices(next)
    void save(linesOf.get(item.key) ?? [], [], next)
  }

  // Scanning: jump to the product; a GS1 pack adds its batch + expiry.
  function onCode(raw: string) {
    if (readOnly) return
    const f = scanFields(raw)
    const hit = items.find((i) => (f.gtin && i.barcodes.includes(f.gtin)) || i.barcodes.includes(f.raw) || barcodes[i.key] === (f.gtin ?? f.raw))
    if (!hit) {
      const open = expanded ? byKey.get(expanded) : null
      if (open && !open.barcodes.length && !barcodes[open.key]) {
        const next = { ...barcodes, [open.key]: f.gtin ?? f.raw }
        setBarcodes(next)
        void save(linesOf.get(open.key) ?? [], [], prices, next)
        toast.info(`Barcode saved for ${open.name}`)
      } else {
        setFilter(f.gtin ?? f.raw)
        toast.info("Not on this shelf — search below to add it")
      }
      return
    }
    setExpanded(hit.key)
    setFilter("")
    const bn = f.batchNumber?.toLowerCase()
    if (bn || f.expiry) {
      const known = bn ? hit.batches.some((b) => b.batchNumber.toLowerCase() === bn) : false
      const already = bn ? (linesOf.get(hit.key) ?? []).some((d) => !d.batchId && d.batchNumber.toLowerCase() === bn) : false
      if (!known && !already) {
        addBatch(hit, { batchNumber: f.batchNumber ?? "", expiry: f.expiry ? f.expiry.slice(0, 7) : "" })
        toast.success(`${hit.name}: batch added — enter how many`)
      }
    }
  }
  const onHardwareScan = (e: BarcodeScanEvent) => onCode(e.raw)
  async function cameraScan() {
    const raw = await captureScan()
    if (raw) onCode(raw)
  }

  // Search the whole catalogue / other shelves for something found here.
  const [found, setFound] = useState<StockTakeItem[] | null>(null)
  const [searching, setSearching] = useState(false)
  async function search() {
    if (filter.trim().length < 2) return
    setSearching(true)
    try {
      const known = new Set(items.map((i) => i.key))
      setFound((await searchSession(id, filter.trim())).filter((i) => !known.has(i.key)).slice(0, 15))
    } catch (err) {
      toast.error(errorMessage(err, "Search needs the internet."))
    } finally {
      setSearching(false)
    }
  }

  // Review / post
  const [review, setReview] = useState<Preview | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [posting, setPosting] = useState(false)
  async function openReview() {
    if (!online) { toast.error("Reviewing and posting need the internet. Your counts are saved on this phone."); return }
    const waiting = Object.values(drafts).some((d) => !d.batchId && countedOf(d, byKey.get(d.itemKey)?.unitsPerPack ?? 1) != null && !d.expiry)
    if (waiting) { toast.error("Add the expiry month for every batch you found."); return }
    setReviewing(true)
    try {
      const left = await flushQueue(id)
      setPending(left)
      if (left) { toast.error("Some counts haven't saved yet. Try again in a moment."); return }
      setReview(await previewSession(id))
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't load the review."))
    } finally {
      setReviewing(false)
    }
  }
  async function post() {
    setPosting(true)
    try {
      const r = await postSession(id)
      toast.success(r.status === "review" ? "Sent for approval" : setup ? "Added to your stock" : "Stock updated")
      setReview(null)
      router.back()
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't post."))
    } finally {
      setPosting(false)
    }
  }
  async function act(action: "cancel" | "reopen") {
    try {
      await changeSession(id, action)
      toast.success(action === "cancel" ? "Stock take cancelled" : "Sent back for a recount")
      setReview(null)
      router.back()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const rows = useMemo<Row[]>(() => {
    const f = filter.trim().toLowerCase()
    const vis = items.filter((i) => !f || i.name.toLowerCase().includes(f) || i.detail.toLowerCase().includes(f) || i.barcodes.includes(filter.trim()))
    const groups = new Map<string, StockTakeItem[]>()
    for (const i of vis) groups.set(i.group, [...(groups.get(i.group) ?? []), i])
    const out: Row[] = []
    for (const [g, list] of groups) {
      out.push({ type: "group", key: `g:${g}`, title: g, done: list.filter(isCounted).length, total: list.length })
      for (const i of list) out.push({ type: "item", key: i.key, item: i })
    }
    return out
  }, [items, filter, isCounted])
  const countedTotal = items.filter(isCounted).length

  if (error && !state) return <Screen><ScreenHeader title="Stock take" /><ErrorState message={error} onRetry={() => load(all, true)} /></Screen>
  if (!data) return <Screen><ScreenHeader title="Stock take" /><SkeletonList rows={8} /></Screen>

  const subtitle = state?.offline || !online
    ? `Offline — ${pending ? `${pending} change${pending === 1 ? "" : "s"} saved on this phone` : "counts save on this phone"}`
    : pending ? "Saving…" : status === "review" ? "Waiting for approval" : setup ? "Setup from the catalogue" : "All changes saved"

  return (
    <Screen>
      <HardwareScanCatcher onScan={onHardwareScan} enabled={!readOnly && expanded === null} />
      <ScreenHeader title={data.session.title} subtitle={subtitle}
        right={!readOnly ? <IconButton icon="barcode-outline" accessibilityLabel="Scan a pack" onPress={cameraScan} /> : null} />
      {status === "review" && data.can.adjust ? (
        <Card style={styles.banner}><Text variant="label">This count is waiting for your approval.</Text><Button title="Review" size="sm" onPress={openReview} loading={reviewing} /></Card>
      ) : null}
      <TextField label="Filter this shelf" hideLabel placeholder="Filter, or scan a barcode" value={filter}
        onChangeText={(t) => { setFilter(t); setFound(null) }} returnKeyType="search" onSubmitEditing={search} />
      {filter.trim().length >= 2 && !readOnly ? (
        <View style={styles.found}>
          {found === null ? (
            <Button variant="ghost" size="sm" title={`Not on this shelf? Search for “${filter.trim()}”`} onPress={search} loading={searching} />
          ) : found.length === 0 ? <Text variant="caption" tone="secondary">Nothing else matches.</Text> : found.map((i) => (
            <Pressable key={i.key} accessibilityRole="button" onPress={() => { setExtra((p) => [{ ...i, group: "Found on this shelf" }, ...p]); setFound(null); setFilter(""); setExpanded(i.key) }}
              style={[styles.foundRow, { borderColor: theme.border }]}>
              <Ionicons name="add-circle-outline" size={18} color={theme.green600} />
              <View style={styles.flex}><Text variant="label">{i.name}</Text><Text variant="caption" tone="tertiary">{i.detail}{i.productId ? "" : " · from catalogue"}</Text></View>
            </Pressable>
          ))}
        </View>
      ) : null}

      <FlashList
        data={rows}
        keyExtractor={(r) => r.key}
        getItemType={(r) => r.type}
        extraData={{ drafts, prices, expanded, barcodes }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item: r }) => r.type === "group" ? (
          <View style={styles.groupRow}><Text variant="caption" tone="secondary">{r.title.toUpperCase()}</Text><Text variant="caption" tone="secondary" tabular>{r.done}/{r.total}</Text></View>
        ) : (
          <ItemRow item={r.item} lines={linesOf.get(r.item.key) ?? []} price={prices[r.item.key]} open={expanded === r.item.key}
            readOnly={readOnly} setup={setup} showExpected={showExpected} canViewCost={data.can.viewCost}
            onToggle={() => setExpanded(expanded === r.item.key ? null : r.item.key)}
            batchDraft={(b) => batchDraft(r.item, b)} onChange={change} onAdd={() => addBatch(r.item)} onRemove={remove}
            onNone={() => none(r.item)} onPrice={(p) => setPrice(r.item, p)} />
        )}
        ListFooterComponent={setup && !all && !readOnly ? (
          <Button variant="ghost" title="Show every registered medicine (PPB)" onPress={() => { setAll(true); void load(true, false) }} />
        ) : <View style={styles.spacer} />}
      />

      {!readOnly ? (
        <View style={[styles.bar, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <View style={styles.flex}>
            <Text variant="label" tabular>{countedTotal} of {items.length} counted</Text>
            <View style={[styles.track, { backgroundColor: theme.mutedStrong }]}>
              <View style={[styles.fill, { backgroundColor: theme.green, width: `${items.length ? Math.round((countedTotal / items.length) * 100) : 0}%` }]} />
            </View>
          </View>
          <Button title="Review" onPress={openReview} loading={reviewing} disabled={countedTotal === 0} />
        </View>
      ) : (
        <Card style={styles.banner}><Text variant="caption">{status === "posted" ? "This stock take is finished and has updated your stock." : "This stock take was cancelled."}</Text></Card>
      )}

      <Sheet open={!!review} onClose={() => setReview(null)} title="Check before you post" scrollable
        footer={review ? (
          <View style={styles.footer}>
            {status === "review" && data.can.adjust ? <Button variant="secondary" title="Send back" onPress={() => act("reopen")} /> : null}
            <Button style={styles.flex} title={status === "review" && data.can.adjust ? "Approve and post" : review.needsApproval ? "Send for approval" : setup ? "Add to my stock" : "Post the count"} loading={posting} onPress={post} />
          </View>
        ) : undefined}>
        {review ? <ReviewBody review={review} setup={setup} /> : null}
        {!readOnly && status === "draft" ? <Button variant="ghost" title="Cancel this stock take" onPress={() => act("cancel")} /> : null}
      </Sheet>
    </Screen>
  )
}

function ReviewBody({ review, setup }: { review: Preview; setup: boolean }) {
  const s = review.summary
  const changes = review.rows.filter((r) => r.kind !== "batch" || r.delta !== 0)
  return (
    <View style={styles.gap}>
      <Text variant="caption" tone="secondary">{s.counted} counted · {review.rows.length - changes.length} matched the records</Text>
      {setup ? (
        <Text variant="bodyStrong">{s.newProducts} new products · {s.unpriced} need a price</Text>
      ) : (
        <Text variant="bodyStrong">+{s.unitsFound} found · −{s.unitsMissing} missing{s.valueMissing != null ? ` (KES ${s.valueMissing.toLocaleString("en-KE")})` : ""}</Text>
      )}
      {review.needsApproval ? <Text tone="warning" variant="caption">An owner or manager needs to approve this: {s.approvalReasons.join("; ")}.</Text> : null}
      {s.unpriced > 0 ? <Text tone="warning" variant="caption">Products without a confirmed price are added off sale until you price them.</Text> : null}
      {changes.map((r) => (
        <View key={r.id} style={styles.reviewRow}>
          <View style={styles.flex}>
            <Text variant="label">{r.name}</Text>
            <Text variant="caption" tone="tertiary">{r.kind === "new_product" ? "New product" : r.kind === "new_batch" ? "Batch found" : `Batch ${r.batch_number ?? ""}`}{r.controlled ? " · Controlled" : ""}</Text>
          </View>
          <Text variant="label" tabular tone={setup ? "default" : r.delta < 0 ? "danger" : "success"}>
            {setup ? (r.price != null ? `KES ${r.price}` : r.kind === "new_product" ? "Needs price" : `${r.counted}`) : `${r.delta > 0 ? "+" : ""}${r.delta}`}
          </Text>
        </View>
      ))}
    </View>
  )
}

function ItemRow({ item, lines, price, open, readOnly, setup, showExpected, canViewCost, onToggle, batchDraft, onChange, onAdd, onRemove, onNone, onPrice }: {
  item: StockTakeItem; lines: Draft[]; price: Price | undefined; open: boolean; readOnly: boolean; setup: boolean; showExpected: boolean; canViewCost: boolean
  onToggle: () => void; batchDraft: (batchId: string) => Draft; onChange: (d: Draft) => void; onAdd: () => void; onRemove: (d: Draft) => void
  onNone: () => void; onPrice: (p: Price) => void
}) {
  const theme = useTheme()
  const upp = Math.max(1, item.unitsPerPack)
  const counted = lines.some((d) => countedOf(d, upp) != null)
  const total = lines.reduce((sum, d) => sum + (countedOf(d, upp) ?? 0), 0)
  const recorded = item.batches.reduce((sum, b) => sum + (b.qty ?? 0), 0)
  const found = lines.filter((d) => !d.batchId)
  const sell = price && price.sell.trim() ? Number(price.sell) : null
  const showPrice = item.needsPrice && (setup || !!item.productId)

  return (
    <View style={[styles.item, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onToggle} style={styles.itemHead}>
        <View style={[styles.check, counted ? { backgroundColor: theme.green, borderColor: theme.green } : { borderColor: theme.borderStrong }]}>
          {counted ? <Ionicons name="checkmark" size={14} color={theme.onAccent} /> : null}
        </View>
        <View style={styles.flex}>
          <Text variant="label" numberOfLines={1}>{item.name}</Text>
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {item.detail}{item.controlled ? " · Controlled" : ""}{showPrice && counted && !(sell && sell > 0) ? " · Needs price" : ""}
          </Text>
        </View>
        <View style={styles.right}>
          <Text variant="caption" tone={counted ? "default" : "tertiary"}>{counted ? amountLabel(total, item) : "Not counted"}</Text>
          {showExpected && item.batches.length ? <Text variant="caption" tone="tertiary">Recorded {amountLabel(recorded, item)}</Text> : null}
        </View>
      </Pressable>
      {open ? (
        <View style={[styles.body, { backgroundColor: theme.muted }]}>
          {item.batches.map((b) => (
            <View key={b.id} style={styles.batch}>
              <View style={styles.flex}>
                <Text variant="label">Batch {b.batchNumber}</Text>
                <Text variant="caption" tone="tertiary">Expires {monthLabel(b.expiry)}{showExpected && b.qty != null ? ` · recorded ${amountLabel(b.qty, item)}` : ""}</Text>
              </View>
              <Qty draft={batchDraft(b.id)} item={item} disabled={readOnly} onChange={onChange} />
            </View>
          ))}
          {found.map((d) => (
            <Card key={d.id} style={styles.gap}>
              <TextField label="Batch no. (optional)" value={d.batchNumber} editable={!readOnly} autoCapitalize="characters"
                onChangeText={(t) => onChange({ ...d, batchNumber: t })} />
              <DateField label="Expiry month" value={d.expiry ? new Date(`${d.expiry}-15T12:00:00`) : null} disabled={readOnly}
                error={countedOf(d, upp) != null && !d.expiry ? "Add the expiry month" : null}
                onChange={(date) => onChange({ ...d, expiry: ym(date) })} />
              <View style={styles.batch}>
                <Qty draft={d} item={item} disabled={readOnly} onChange={onChange} />
                {!readOnly ? <IconButton icon="trash-outline" variant="danger" accessibilityLabel="Remove this batch" onPress={() => onRemove(d)} /> : null}
              </View>
            </Card>
          ))}
          {showPrice ? (
            <Card style={styles.gap}>
              <TextField label={`Selling price per ${item.baseUnit} (KES)`} keyboardType="decimal-pad" value={price?.sell ?? ""} editable={!readOnly}
                helper={sell && sell > 0 ? "Price confirmed" : item.suggestedSell != null ? "Confirm the suggested price or type your own" : "Type your price"}
                onChangeText={(t) => onPrice({ sell: t.replace(/[^0-9.]/g, ""), costPack: price?.costPack ?? "" })} />
              {item.suggestedSell != null && !(sell && sell > 0) && !readOnly ? (
                <Button variant="secondary" size="sm" title={`Use KES ${item.suggestedSell.toLocaleString("en-KE")}`}
                  onPress={() => onPrice({ sell: String(item.suggestedSell), costPack: price?.costPack || (item.suggestedCost != null ? String(Math.round(item.suggestedCost * upp * 100) / 100) : "") })} />
              ) : null}
              {canViewCost ? (
                <TextField label={`Cost per ${item.packLabel ?? "pack"} (KES)`} keyboardType="decimal-pad" value={price?.costPack ?? ""} editable={!readOnly}
                  onChangeText={(t) => onPrice({ sell: price?.sell ?? "", costPack: t.replace(/[^0-9.]/g, "") })} />
              ) : null}
            </Card>
          ) : null}
          {!readOnly ? (
            <View style={styles.actions}>
              <Button variant="secondary" size="sm" title={item.batches.length || found.length ? "Another batch" : "Add what's on the shelf"} onPress={onAdd} />
              {item.batches.length ? <Button variant="ghost" size="sm" title="None on shelf" onPress={onNone} /> : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

function Qty({ draft, item, disabled, onChange }: { draft: Draft; item: StockTakeItem; disabled: boolean; onChange: (d: Draft) => void }) {
  const upp = Math.max(1, item.unitsPerPack)
  const clean = (v: string) => v.replace(/[^0-9]/g, "").slice(0, 7)
  if (upp === 1) {
    return (
      <TextField label={`${item.baseUnit}s`} keyboardType="number-pad" value={draft.packs} placeholder="0" editable={!disabled}
        containerStyle={styles.qty} onChangeText={(t) => onChange({ ...draft, packs: clean(t), loose: "" })} />
    )
  }
  return (
    <View style={styles.qtyRow}>
      <TextField label={`Packs ×${upp}`} keyboardType="number-pad" value={draft.packs} placeholder="0" editable={!disabled}
        containerStyle={styles.qty} onChangeText={(t) => onChange({ ...draft, packs: clean(t) })} />
      <TextField label={`Loose ${item.baseUnit}s`} keyboardType="number-pad" value={draft.loose} placeholder="0" editable={!disabled}
        containerStyle={styles.qty} onChangeText={(t) => onChange({ ...draft, loose: clean(t) })} />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.sm },
  spacer: { height: space.xl },
  banner: { gap: space.sm, marginBottom: space.sm },
  found: { gap: space.xs, marginVertical: space.xs },
  foundRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  groupRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: space.md, paddingBottom: space.xs },
  item: { borderWidth: 1, borderRadius: radius.md, marginBottom: space.xs, overflow: "hidden" },
  itemHead: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, minHeight: 56 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  right: { alignItems: "flex-end", maxWidth: "40%" },
  body: { padding: space.md, gap: space.md },
  batch: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  qtyRow: { flexDirection: "row", gap: space.sm },
  qty: { width: 96 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  bar: { flexDirection: "row", alignItems: "center", gap: space.md, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  track: { height: 6, borderRadius: 3, marginTop: space.xs, overflow: "hidden" },
  fill: { height: 6 },
  footer: { flexDirection: "row", gap: space.sm },
  reviewRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs },
})
