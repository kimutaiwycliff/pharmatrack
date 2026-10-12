import { useState } from "react"
import { StyleSheet, View } from "react-native"
import { FlashList } from "@shopify/flash-list"
import * as DocumentPicker from "expo-document-picker"
import { File, Paths } from "expo-file-system"
import * as Sharing from "expo-sharing"
import Ionicons from "@expo/vector-icons/Ionicons"
import { parseCSV, csvRowsToRecords, toCSV, INVENTORY_IMPORT_HEADERS, INVENTORY_IMPORT_EXAMPLE_ROW } from "@pharmatrack/core"
import { apiJson, errorMessage } from "../src/lib/api"
import { env } from "../src/lib/env"
import { importLocalInventoryRows } from "../src/repo/inventory"
import { toast } from "../src/lib/toast"
import { useCan } from "../src/hooks/useCan"
import { useSessionStore } from "../src/store/session"
import { useTheme } from "../src/theme/useTheme"
import { space } from "../src/theme/tokens"
import { Button, Card, EmptyState, ListRow, Screen, ScreenHeader, StatusBadge, Text } from "../src/components"
import {
  buildImportPreview, issueLabel, missingRequiredColumns, type ImportPreview, type PreviewRow,
} from "../src/features/catalogue/logic/importPreview"

// Mirrors apps/web/app/api/inventory/import/route.ts's contract: POST
// { branch_id?, rows: Record<string,unknown>[] } (max 2000 rows, needs
// stock.receive); the server does all field validation/coercion and returns
// per-row errors. Unlike web's BulkImportDialog there's no drag-and-drop
// column mapper (a poor fit for a phone) — headers must match
// INVENTORY_IMPORT_HEADERS, which "Get template" hands out. The preview only
// flags rows missing the two required columns; flagged rows are still sent
// and come back as failed, exactly as before. Offline Edition imports into
// the local database instead.
const MAX_ROWS = 2000

interface ImportResult {
  created: number
  stockBatches: number
  failed: number
  total: number
  errors: { row: number; name: string; error: string }[]
}

type Item = { kind: "preview"; row: PreviewRow } | { kind: "error"; row: number; name: string; error: string }

export default function InventoryImport() {
  const theme = useTheme()
  const can = useCan()
  const { branchId } = useSessionStore()

  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<Record<string, string>[] | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  if (!can("stock.receive")) {
    return (
      <Screen>
        <ScreenHeader title="Bulk import" />
        <EmptyState
          icon={<Ionicons name="lock-closed-outline" size={32} color={theme.textTertiary} />}
          title="No access"
          message="Bulk import needs the “Receive stock” permission. Ask the owner to turn it on for your role."
        />
      </Screen>
    )
  }

  async function getTemplate() {
    try {
      const csv = toCSV(INVENTORY_IMPORT_HEADERS, [INVENTORY_IMPORT_EXAMPLE_ROW])
      const file = new File(Paths.cache, "pharmatrack-inventory-template.csv")
      file.write(csv)
      await Sharing.shareAsync(file.uri, { mimeType: "text/csv", UTI: "public.comma-separated-values-text" })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not share the template")
    }
  }

  function clearFile() {
    setRows(null)
    setPreview(null)
    setFileName(null)
  }

  async function pickFile() {
    setParseError(null)
    setResult(null)
    clearFile()
    setPicking(true)
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true })
      if (picked.canceled || !picked.assets?.[0]) return
      const asset = picked.assets[0]
      const text = await new File(asset.uri).text()
      const parsedRows = csvRowsToRecords(parseCSV(text))
      if (parsedRows.length === 0) {
        setParseError("No data rows found in that file")
        return
      }
      if (parsedRows.length > MAX_ROWS) {
        setParseError(`Too many rows (${parsedRows.length.toLocaleString()}) — max ${MAX_ROWS.toLocaleString()}`)
        return
      }
      const missing = missingRequiredColumns(parsedRows[0])
      if (missing.length > 0) {
        setParseError(`Missing required column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")} — use “Get template” to see the expected headers`)
        return
      }
      setFileName(asset.name)
      setRows(parsedRows)
      setPreview(buildImportPreview(parsedRows))
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Could not read that file")
    } finally {
      setPicking(false)
    }
  }

  async function submitImport() {
    if (!rows) return
    setImporting(true)
    try {
      const json = env.EXPO_PUBLIC_OFFLINE_MODE
        ? await importLocalInventoryRows(branchId ?? "", rows)
        : await apiJson<ImportResult>("/api/inventory/import", { method: "POST", body: { branch_id: branchId ?? undefined, rows } })
      setResult(json)
      clearFile()
      if (json.failed === 0) toast.success(`Imported ${json.created} product${json.created === 1 ? "" : "s"}`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setImporting(false)
    }
  }

  const items: Item[] = preview
    ? preview.rows.map((row) => ({ kind: "preview", row }))
    : result
      ? result.errors.map((e) => ({ kind: "error", ...e }))
      : []

  const header = (
    <View style={styles.header}>
      <Card style={styles.card}>
        <Text variant="headline">Import products from CSV</Text>
        <Text tone="secondary">
          Pick a CSV file with a header row matching the template (name and selling_price are required; everything else is
          optional). Up to {MAX_ROWS.toLocaleString()} rows.
        </Text>
        <View style={styles.actionsRow}>
          <Button
            title="Get template"
            variant="secondary"
            onPress={getTemplate}
            leadingIcon={<Ionicons name="download-outline" size={18} color={theme.text} />}
            style={styles.flex}
          />
          <Button
            title={rows ? "Pick another" : "Pick CSV file"}
            onPress={pickFile}
            loading={picking}
            disabled={importing}
            leadingIcon={<Ionicons name="document-outline" size={18} color={theme.onAccent} />}
            style={styles.flex}
          />
        </View>
        {parseError ? (
          <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
            {parseError}
          </Text>
        ) : null}
      </Card>

      {preview && rows ? (
        <View style={styles.sectionHead}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {fileName}
          </Text>
          <Text variant="caption" tone="secondary">
            {rows.length.toLocaleString()} row{rows.length === 1 ? "" : "s"}
            {preview.flagged > 0 ? ` · ${preview.flagged} look incomplete and will be reported as failed` : " · all rows have a name and price"}
          </Text>
        </View>
      ) : null}

      {result ? (
        <Card style={styles.card}>
          <View style={styles.resultTitle}>
            <Ionicons
              name={result.failed === 0 ? "checkmark-circle" : "alert-circle"}
              size={22}
              color={result.failed === 0 ? theme.green : theme.amber}
            />
            <Text variant="headline">Import complete</Text>
          </View>
          <Text tone="secondary">
            {result.created} created, {result.stockBatches} opening batch{result.stockBatches === 1 ? "" : "es"} added,{" "}
            {result.failed} failed (of {result.total} rows).
          </Text>
          {result.errors.length > 0 ? (
            <Text variant="label" tone="secondary">
              {result.errors.length < result.failed ? `First ${result.errors.length} issues` : `Issue${result.errors.length === 1 ? "" : "s"}`}
            </Text>
          ) : null}
        </Card>
      ) : null}
    </View>
  )

  return (
    <Screen>
      <ScreenHeader title="Bulk import" subtitle={env.EXPO_PUBLIC_OFFLINE_MODE ? "Into this device's catalogue" : null} />
      <View style={styles.flex}>
        <FlashList
          data={items}
          keyExtractor={(item) => (item.kind === "preview" ? `p-${item.row.row}` : `e-${item.row}`)}
          getItemType={(item) => item.kind}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={header}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) =>
            item.kind === "preview" ? (
              <ListRow
                title={item.row.name || "(missing name)"}
                subtitle={`Row ${item.row.row} · ${item.row.price ? `KES ${item.row.price}` : "no price"}`}
                meta={
                  item.row.issues.length > 0 ? (
                    <Text variant="caption" tone="danger">
                      {item.row.issues.map(issueLabel).join(" · ")}
                    </Text>
                  ) : null
                }
                trailing={
                  item.row.issues.length > 0 ? <StatusBadge status="warning" label="Check" /> : <StatusBadge status="ok" label="OK" />
                }
              />
            ) : (
              <ListRow
                title={`Row ${item.row}${item.name ? ` · ${item.name}` : ""}`}
                leading={<Ionicons name="alert-circle-outline" size={20} color={theme.red} />}
                meta={
                  <Text variant="caption" tone="danger">
                    {item.error}
                  </Text>
                }
              />
            )
          }
        />
      </View>
      {rows ? (
        <View style={[styles.footer, { borderTopColor: theme.border }]}>
          <Button
            title={`Import ${rows.length.toLocaleString()} product${rows.length === 1 ? "" : "s"}`}
            onPress={submitImport}
            loading={importing}
            size="lg"
            leadingIcon={<Ionicons name="cloud-upload-outline" size={20} color={theme.onAccent} />}
          />
        </View>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listContent: { paddingBottom: space.xxl },
  header: { gap: space.md, marginBottom: space.sm },
  card: { gap: space.sm },
  actionsRow: { flexDirection: "row", gap: space.sm, marginTop: space.xs },
  sectionHead: { gap: space.xxs },
  resultTitle: { flexDirection: "row", alignItems: "center", gap: space.sm },
  footer: { paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth },
})
