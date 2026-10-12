import Ionicons from "@expo/vector-icons/Ionicons"
import { router } from "expo-router"
import { useState, type ReactNode } from "react"
import { Alert, StyleSheet, View } from "react-native"
import { Button, Card, FormScroll, IconButton, Text, TextField } from "../../../components"
import { useCan } from "../../../hooks/useCan"
import { useQuery } from "../../../hooks/useQuery"
import { ApiError, errorMessage } from "../../../lib/api"
import { toast } from "../../../lib/toast"
import { captureScan } from "../../../lib/scanCapture"
import { scanFields } from "../../../lib/stock/scan-fields"
import { useTheme } from "../../../theme/useTheme"
import { space } from "../../../theme/tokens"
import { createProduct, listCategories, listSuppliers, listUsedUnits, updateProduct } from "../data"
import { notifyProductsChanged } from "../events"
import {
  applyCatalogItem, BASE_UNITS, categoryLabel, costFieldVisible, defaultBaseUnit, DOSAGE_FORMS, emptyProductForm, existingProductId,
  filterSuggestions, formFromProduct, marginPercent, mergeSuggestions, orderCategories, validateProductForm,
  type ProductFormErrors, type ProductFormValues,
} from "../logic/form"
import type { CatalogItem, ProductDetail } from "../types"
import { CatalogAutofill } from "./CatalogAutofill"
import { ImageField } from "./ImageField"
import { PickerField, type PickerOption } from "./PickerField"
import { SuggestionChips } from "./SuggestionChips"
import { ToggleRow } from "./ToggleRow"

type ProductFormProps =
  | { mode: "create"; prefill?: { gtin?: string | null; name?: string | null } }
  | { mode: "edit"; product: ProductDetail }

// The one product form behind /products/new and /products/[id]/edit (web's
// NewProductDialog + EditProductSheet). Everything the old single-screen
// products.tsx form did — every field, category/supplier pickers, photo,
// controlled/Rx/active flags, cost only with cost.view — plus catalog
// autofill (create), barcode scan and org-used unit suggestions. Pack sizes,
// split-unit, labels and delete live on the detail screen. Reads/writes go
// through ../data, so the Offline Edition uses the local repo automatically.
export function ProductForm(props: ProductFormProps) {
  const theme = useTheme()
  const can = useCan()
  const editing = props.mode === "edit" ? props.product : null
  const showCost = costFieldVisible({ canViewCost: can("cost.view"), mode: props.mode, product: editing })

  const [values, setValues] = useState<ProductFormValues>(() =>
    editing ? formFromProduct(editing) : emptyProductForm(props.mode === "create" ? props.prefill : undefined),
  )
  const [errors, setErrors] = useState<ProductFormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Until the user types a base unit, picking a dosage form suggests one (create only).
  const [unitTouched, setUnitTouched] = useState(props.mode === "edit")

  const cats = useQuery("product-categories", () => listCategories())
  const sups = useQuery("product-suppliers", () => listSuppliers())
  const used = useQuery("product-units", () => listUsedUnits().catch(() => ({ base_units: [], dosage_forms: [] })))

  const categoryOptions: PickerOption[] = orderCategories(cats.data ?? []).map((c) => ({
    id: c.id,
    label: categoryLabel(c, cats.data ?? []),
    child: !!c.parent_id,
  }))
  const supplierOptions: PickerOption[] = [...(sups.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({ id: s.id, label: s.name }))
  const dosageSuggestions = filterSuggestions(mergeSuggestions(DOSAGE_FORMS, used.data?.dosage_forms), values.dosage_form)
  const unitSuggestions = filterSuggestions(mergeSuggestions(BASE_UNITS, used.data?.base_units), values.base_unit)
  const margin = showCost ? marginPercent(values.cost_price, values.selling_price) : null

  function set<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function setDosageForm(form: string) {
    setValues((v) => ({ ...v, dosage_form: form, base_unit: unitTouched ? v.base_unit : defaultBaseUnit(form) }))
    if (errors.dosage_form) setErrors((e) => ({ ...e, dosage_form: undefined }))
  }

  function setBaseUnit(unit: string) {
    setUnitTouched(true)
    set("base_unit", unit)
  }

  function onCatalogPick(item: CatalogItem) {
    setValues((v) => applyCatalogItem(v, item))
    setUnitTouched(true)
    setErrors({})
  }

  async function scan() {
    const raw = await captureScan()
    if (!raw) return
    const f = scanFields(raw)
    if (f.gtin) {
      set("gtin", f.gtin)
      toast.info(`GTIN ${f.gtin} filled from the pack`)
    } else {
      set("barcode_raw", f.raw)
      toast.info("Barcode filled from the pack")
    }
  }

  async function save() {
    setFormError(null)
    const r = validateProductForm(values, { mode: props.mode, costVisible: showCost })
    if (!r.ok) {
      setErrors(r.errors)
      toast.error("Check the highlighted fields")
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await updateProduct(editing.id, r.body)
        notifyProductsChanged()
        toast.success("Product saved")
        router.back()
      } else {
        const id = await createProduct(r.body)
        notifyProductsChanged()
        toast.success(`${r.body.name} added`)
        router.replace({ pathname: "/products/[id]", params: { id } })
      }
    } catch (err) {
      const dupe = err instanceof ApiError && err.status === 409 ? existingProductId(err.body) : null
      if (dupe) {
        Alert.alert("Already in your catalogue", errorMessage(err), [
          { text: "Stay here", style: "cancel" },
          { text: "Open it", onPress: () => router.replace({ pathname: "/products/[id]", params: { id: dupe } }) },
        ])
      } else {
        setFormError(errorMessage(err))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormScroll
      footer={
        <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.bg }]}>
          {formError ? (
            <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
              {formError}
            </Text>
          ) : null}
          <Button title={editing ? "Save changes" : "Add product"} onPress={save} loading={saving} />
        </View>
      }
    >
      {editing ? null : <CatalogAutofill onPick={onCatalogPick} />}

      <ImageField value={values.image_url} onChange={(url) => set("image_url", url)} />

      <Section title="What it is">
        <TextField
          label="Generic name"
          value={values.name}
          onChangeText={(v) => set("name", v)}
          error={errors.name}
          placeholder="e.g. Amoxicillin"
          autoCapitalize="words"
        />
        <TextField
          label="Brand name (optional)"
          value={values.brand_name}
          onChangeText={(v) => set("brand_name", v)}
          placeholder="e.g. Amoxil"
          autoCapitalize="words"
        />
        {editing ? null : (
          <TextField
            label="Generic (INN) name (optional)"
            value={values.generic_name}
            onChangeText={(v) => set("generic_name", v)}
            helper="Filled from the name if left blank"
            autoCapitalize="words"
          />
        )}
        <TextField
          label="Manufacturer (optional)"
          value={values.manufacturer}
          onChangeText={(v) => set("manufacturer", v)}
          autoCapitalize="words"
        />
        <View style={styles.row}>
          <TextField
            label="Strength"
            value={values.strength}
            onChangeText={(v) => set("strength", v)}
            placeholder="e.g. 500mg"
            autoCapitalize="none"
            containerStyle={styles.flex}
          />
          <TextField
            label="Dosage form"
            value={values.dosage_form}
            onChangeText={setDosageForm}
            error={errors.dosage_form}
            placeholder="e.g. Tablet"
            autoCapitalize="words"
            containerStyle={styles.flex}
          />
        </View>
        <SuggestionChips label="Dosage form" options={dosageSuggestions} onPick={setDosageForm} />
        <PickerField
          label="Category"
          value={values.category_id}
          options={categoryOptions}
          onChange={(id) => set("category_id", id)}
          loading={cats.loading}
          helper={cats.error ? "Couldn't load categories" : undefined}
        />
        <PickerField
          label="Default supplier"
          value={values.supplier_id}
          options={supplierOptions}
          onChange={(id) => set("supplier_id", id)}
          loading={sups.loading}
          helper={sups.error ? "Couldn't load suppliers" : undefined}
        />
      </Section>

      <Section title="Barcode">
        <TextField
          label="GTIN"
          value={values.gtin}
          onChangeText={(v) => set("gtin", v)}
          error={errors.gtin}
          keyboardType="number-pad"
          autoCapitalize="none"
          helper="The number under the pack's barcode"
          trailing={<IconButton icon="scan-outline" accessibilityLabel="Scan the pack's barcode" onPress={scan} />}
        />
        <TextField
          label="Other barcode (optional)"
          value={values.barcode_raw}
          onChangeText={(v) => set("barcode_raw", v)}
          autoCapitalize="none"
          autoCorrect={false}
          helper={values.gtin.trim() || values.barcode_raw.trim() ? undefined : "Leave both blank and one is generated for you"}
        />
      </Section>

      <Section title="How it's sold">
        <TextField
          label="Base unit"
          value={values.base_unit}
          onChangeText={setBaseUnit}
          error={errors.base_unit}
          helper="The smallest unit you sell — prices and stock count in this"
          autoCapitalize="none"
        />
        <SuggestionChips label="Base unit" options={unitSuggestions} onPick={setBaseUnit} />
        <View style={styles.row}>
          <TextField
            label="Pack name (optional)"
            value={values.pack_label}
            onChangeText={(v) => set("pack_label", v)}
            placeholder="e.g. Box"
            containerStyle={styles.flex}
          />
          <TextField
            label={`${values.base_unit.trim() || "Units"} per pack`}
            value={values.units_per_pack}
            onChangeText={(v) => set("units_per_pack", v)}
            error={errors.units_per_pack}
            keyboardType="number-pad"
            containerStyle={styles.flex}
          />
        </View>
        <TextField
          label="Low-stock alert at"
          value={values.reorder_level}
          onChangeText={(v) => set("reorder_level", v)}
          error={errors.reorder_level}
          keyboardType="number-pad"
          helper={`Warn when stock falls to this many ${values.base_unit.trim() || "units"}`}
        />
      </Section>

      <Section title="Price">
        <View style={styles.row}>
          <TextField
            label={`Selling price per ${values.base_unit.trim() || "unit"} (KES)`}
            value={values.selling_price}
            onChangeText={(v) => set("selling_price", v)}
            error={errors.selling_price}
            keyboardType="decimal-pad"
            placeholder="0.00"
            containerStyle={styles.flex}
          />
          {showCost ? (
            <TextField
              label="Cost (KES, optional)"
              value={values.cost_price}
              onChangeText={(v) => set("cost_price", v)}
              error={errors.cost_price}
              keyboardType="decimal-pad"
              placeholder="0.00"
              containerStyle={styles.flex}
            />
          ) : null}
        </View>
        {margin != null ? (
          <Text variant="caption" tone={margin >= 20 ? "success" : margin >= 0 ? "warning" : "danger"} accessibilityLiveRegion="polite">
            Margin {margin.toFixed(1)}%
          </Text>
        ) : null}
        <TextField
          label="Max discount % (optional)"
          value={values.max_discount_percent}
          onChangeText={(v) => set("max_discount_percent", v)}
          error={errors.max_discount_percent}
          keyboardType="decimal-pad"
          helper="Cap on the discount a cashier can give. Blank = no limit"
        />
      </Section>

      <Section title="Rules">
        <ToggleRow
          label="Prescription only"
          description="The till asks for a prescription before selling"
          value={values.requires_prescription}
          onChange={(v) => set("requires_prescription", v)}
        />
        <ToggleRow
          label="Controlled substance"
          description="Each sale is recorded in the PPB register"
          value={values.is_controlled}
          onChange={(v) => set("is_controlled", v)}
        />
        {editing ? (
          <ToggleRow
            label="Active"
            description="Turn off to hide it from POS and inventory without deleting it"
            value={values.is_active}
            onChange={(v) => set("is_active", v)}
          />
        ) : null}
      </Section>

      {editing ? null : (
        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={16} color={theme.textSecondary} />
          <Text variant="caption" tone="secondary" style={styles.flex}>
            After saving you can add pack sizes and receive stock.
          </Text>
        </View>
      )}
    </FormScroll>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card style={styles.section}>
      <Text variant="headline" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </Card>
  )
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  row: { flexDirection: "row", gap: space.md },
  flex: { flex: 1 },
  note: { flexDirection: "row", alignItems: "center", gap: space.xs },
  footer: { gap: space.xs, paddingTop: space.sm, paddingBottom: space.md, borderTopWidth: StyleSheet.hairlineWidth },
})
