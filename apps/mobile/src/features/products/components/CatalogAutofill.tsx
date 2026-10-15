import Ionicons from "@expo/vector-icons/Ionicons"
import { useEffect, useState } from "react"
import { ActivityIndicator, StyleSheet, View } from "react-native"
import { Card, IconButton, ListRow, StatusBadge, Text, TextField } from "../../../components"
import { useQuery } from "../../../hooks/useQuery"
import { errorMessage } from "../../../lib/api"
import { captureScan } from "../../../lib/scanCapture"
import { scanFields, scanMatchesProduct } from "../../../lib/stock/scan-fields"
import { toast } from "../../../lib/toast"
import { useTheme } from "../../../theme/useTheme"
import { space } from "../../../theme/tokens"
import { listProducts, searchCatalog } from "../data"
import { looksLikeBarcode } from "../logic/form"
import type { CatalogItem, ProductListItem } from "../types"

interface Props {
  /** A catalogue row was chosen — fill the form from it. */
  onPick: (item: CatalogItem) => void
  /** The pharmacy already has this product — open it instead of adding it twice. */
  onOpenExisting: (productId: string) => void
  /** A barcode nobody knows yet — start a new product carrying it. */
  onNewBarcode: (gtin: string | null, raw: string) => void
}

const label = (p: { name: string; strength: string | null }) => `${p.name}${p.strength ? ` ${p.strength}` : ""}`

// The "Add product" find box (web: components/inventory/NewProductDialog.tsx):
// type a name or molecule, or scan — a Bluetooth/USB scanner types the code
// into this field and presses Enter; the Scan button uses the camera. Shows
// the pharmacy's own matches first (open, don't duplicate), then the shared
// drug catalogue (curated list + PPB register; the bundled KEML list in the
// Offline Edition). Picking fills the form below; everything stays editable.
export function CatalogAutofill({ onPick, onOpenExisting, onNewBarcode }: Props) {
  const theme = useTheme()
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  const [picked, setPicked] = useState<string | null>(null)
  const [looking, setLooking] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(t)
  }, [query])

  const searchable = debounced && !looksLikeBarcode(debounced) ? debounced : null
  const catalog = useQuery(searchable ? `catalog:${searchable}` : null, () => searchCatalog(searchable!))
  const own = useQuery(searchable && searchable.length >= 2 ? `own-products:${searchable}` : null, () =>
    listProducts(1, searchable!).then((p) => p.items.slice(0, 4)),
  )
  const live = !!searchable && query.trim() === searchable
  const ownItems: ProductListItem[] = live ? (own.data ?? []) : []
  const catItems: CatalogItem[] = live ? (catalog.data ?? []) : []

  function pick(item: CatalogItem) {
    onPick(item)
    setPicked(label(item))
    setQuery("")
  }

  // Exact barcode lookup: ours → open it; in the catalogue → fill; else new.
  async function lookupBarcode(raw: string) {
    const scan = scanFields(raw)
    const code = scan.gtin ?? scan.raw
    setLooking(true)
    try {
      const mine = (await listProducts(1, code)).items.find((p) => scanMatchesProduct(scan, p))
      if (mine) {
        toast.info(`${label(mine)} is already in your products`)
        onOpenExisting(mine.id)
        return
      }
      const hit = scan.gtin ? (await searchCatalog(scan.gtin)).find((i) => i.gtin === scan.gtin) : undefined
      if (hit) {
        onPick({ ...hit, gtin: hit.gtin ?? scan.gtin })
        setPicked(label(hit))
      } else {
        onNewBarcode(scan.gtin, scan.raw)
        setPicked(null)
        toast.info(`New barcode ${code} — fill in the product below`)
      }
      setQuery("")
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't look that barcode up"))
    } finally {
      setLooking(false)
    }
  }

  async function scanWithCamera() {
    const raw = await captureScan()
    if (raw) await lookupBarcode(raw)
  }

  function submit() {
    const q = query.trim()
    if (!q) return
    if (looksLikeBarcode(q)) {
      void lookupBarcode(q)
      return
    }
    // Enter on a name: take the best match, own products first.
    if (ownItems[0]) onOpenExisting(ownItems[0].id)
    else if (catItems[0]) pick(catItems[0])
  }

  const busy = looking || catalog.loading || own.loading
  const nothing = live && !busy && catalog.data !== undefined && ownItems.length === 0 && catItems.length === 0

  return (
    <Card style={[styles.card, { backgroundColor: theme.green50, borderColor: theme.green100 }]}>
      <View style={styles.head}>
        <Ionicons name="sparkles-outline" size={16} color={theme.green600} />
        <Text variant="label" tone="success">
          Find it first
        </Text>
      </View>
      <TextField
        label="Find the product to add"
        hideLabel
        placeholder="Type a name or molecule, or scan"
        value={query}
        onChangeText={(v) => {
          setQuery(v)
          setPicked(null)
        }}
        onSubmitEditing={submit}
        returnKeyType="search"
        submitBehavior="submit"
        autoCorrect={false}
        autoCapitalize="none"
        leading={<Ionicons name="search" size={18} color={theme.textTertiary} />}
        trailing={
          busy ? (
            <ActivityIndicator color={theme.green} />
          ) : (
            <IconButton icon="scan-outline" accessibilityLabel="Scan the pack's barcode with the camera" onPress={scanWithCamera} />
          )
        }
      />
      {ownItems.length > 0 ? (
        <View style={[styles.results, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Text variant="caption" tone="secondary" style={styles.groupTitle}>
            ALREADY IN YOUR PRODUCTS
          </Text>
          {ownItems.map((p) => (
            <ListRow
              key={p.id}
              title={label(p)}
              subtitle={[p.dosage_form, p.generic_name].filter(Boolean).join(" · ") || undefined}
              onPress={() => onOpenExisting(p.id)}
              accessibilityHint="Opens the product you already have"
              meta={<StatusBadge status="ok" label="Open" />}
            />
          ))}
        </View>
      ) : null}
      {catItems.length > 0 ? (
        <View style={[styles.results, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Text variant="caption" tone="secondary" style={styles.groupTitle}>
            FROM THE CATALOGUE
          </Text>
          {catItems.map((item) => (
            <ListRow
              key={item.id}
              title={label(item)}
              subtitle={[
                item.dosage_form,
                item.generic_name ?? item.brand_name,
                item.reference_price ? `~KES ${item.reference_price}/${item.base_unit}` : `per ${item.base_unit}`,
                item.ppb_registration_no ? `PPB ${item.ppb_registration_no}` : null,
              ].filter(Boolean).join(" · ")}
              onPress={() => pick(item)}
              accessibilityHint="Fills in this product's details"
              meta={
                item.requires_prescription || item.is_controlled ? (
                  <View style={styles.badges}>
                    {item.requires_prescription ? <StatusBadge status="neutral" label="Rx" /> : null}
                    {item.is_controlled ? <StatusBadge status="warning" label="Controlled" /> : null}
                  </View>
                ) : null
              }
            />
          ))}
        </View>
      ) : null}
      {nothing ? (
        <Text variant="caption" tone="secondary">
          Nothing matches “{debounced}” — fill the details in below.
        </Text>
      ) : null}
      {catalog.error ? (
        <Text variant="caption" tone="danger">
          {catalog.error}
        </Text>
      ) : null}
      {picked ? (
        <Text variant="caption" tone="success" accessibilityLiveRegion="polite">
          Filled in {picked} — check the details, then set the price below.
        </Text>
      ) : !live ? (
        <Text variant="caption" tone="secondary">
          We check your products first so nothing is added twice, then fill the details from the drug catalogue (including the
          Pharmacy and Poisons Board register). A Bluetooth or USB scanner works straight into this box.
        </Text>
      ) : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { gap: space.sm },
  head: { flexDirection: "row", alignItems: "center", gap: space.xs },
  results: { borderWidth: 1, borderRadius: 10, overflow: "hidden" },
  groupTitle: { paddingHorizontal: space.md, paddingTop: space.sm, letterSpacing: 0.5 },
  badges: { flexDirection: "row", gap: space.xs, marginTop: space.xxs },
})
