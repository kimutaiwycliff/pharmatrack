import { useState } from "react"
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native"
import * as DocumentPicker from "expo-document-picker"
import { File, Paths } from "expo-file-system"
import * as Sharing from "expo-sharing"
import Ionicons from "@expo/vector-icons/Ionicons"
import { parseCSV, csvRowsToRecords, toCSV, INVENTORY_IMPORT_HEADERS, INVENTORY_IMPORT_EXAMPLE_ROW } from "@pharmatrack/core"
import { apiFetch } from "../src/lib/api-fetch"
import { toast } from "../src/lib/toast"
import { useSessionStore } from "../src/store/session"
import { useTheme } from "../src/theme/useTheme"
import type { Theme } from "../src/theme/tokens"
import { Button, Card, Screen, ScreenHeader } from "../src/components"

// Mirrors apps/web/app/api/inventory/import/route.ts's contract exactly: POST
// { branch_id?, rows: Record<string,unknown>[] } (max 2000 rows), server does
// all field validation/coercion. Unlike web's BulkImportDialog, this skips the
// column-mapping-with-manual-override step — a drag-and-drop mapper is a poor
// fit for a phone screen — and instead expects the CSV headers to already
// match INVENTORY_IMPORT_HEADERS (the same shared constant web's template
// download button writes), which the "Get template" button here hands out.
const MAX_ROWS = 2000

interface ImportResult { created: number; stockBatches: number; failed: number; total: number; errors: { row: number; name: string; error: string }[] }

export default function InventoryImport() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const { branchId } = useSessionStore()

  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<Record<string, string>[] | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

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

  async function pickFile() {
    setParseError(null)
    setResult(null)
    setRows(null)
    const picked = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true })
    if (picked.canceled || !picked.assets?.[0]) return
    const asset = picked.assets[0]
    try {
      const text = await new File(asset.uri).text()
      const parsedRows = csvRowsToRecords(parseCSV(text))
      if (parsedRows.length === 0) { setParseError("No data rows found in that file"); return }
      if (parsedRows.length > MAX_ROWS) { setParseError(`Too many rows (${parsedRows.length}) — max ${MAX_ROWS}`); return }
      if (!("name" in parsedRows[0]!) || !("selling_price" in parsedRows[0]!)) {
        setParseError("Missing required columns — use \"Get template\" below to see the expected headers")
        return
      }
      setFileName(asset.name)
      setRows(parsedRows)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Could not read that file")
    }
  }

  async function submitImport() {
    if (!rows) return
    setImporting(true)
    try {
      const res = await apiFetch("/api/inventory/import", {
        method: "POST",
        body: JSON.stringify({ branch_id: branchId ?? undefined, rows }),
      })
      const json = (await res.json()) as ImportResult & { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Import failed")
      setResult(json)
      setRows(null)
      setFileName(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setImporting(false)
    }
  }

  return (
    <Screen>
      <ScreenHeader title="Bulk import" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Card style={styles.card}>
          <Text style={styles.title}>Import products from CSV</Text>
          <Text style={styles.body}>
            Pick a CSV file with a header row matching the template columns (name and selling_price are
            required; everything else is optional). Up to {MAX_ROWS.toLocaleString()} rows.
          </Text>
          <View style={styles.actionsRow}>
            <Button title="Get template" variant="secondary" onPress={getTemplate} icon={<Ionicons name="download-outline" size={16} color={theme.text} />} style={styles.actionButton} />
            <Button title="Pick CSV file" onPress={pickFile} icon={<Ionicons name="document-outline" size={16} color="#fff" />} style={styles.actionButton} />
          </View>
          {parseError && <Text style={styles.error}>{parseError}</Text>}
        </Card>

        {rows && (
          <Card style={styles.card}>
            <Text style={styles.title}>{fileName}</Text>
            <Text style={styles.body}>{rows.length} row{rows.length === 1 ? "" : "s"} found. First few:</Text>
            {rows.slice(0, 5).map((r, i) => (
              <Text key={i} style={styles.previewRow}>• {r.name || "(missing name)"} — {r.selling_price || "(missing price)"}</Text>
            ))}
            <Button title={`Import ${rows.length} product${rows.length === 1 ? "" : "s"}`} onPress={submitImport} loading={importing} />
          </Card>
        )}

        {importing && (
          <View style={styles.centered}><ActivityIndicator color={theme.green} /><Text style={styles.body}>Importing…</Text></View>
        )}

        {result && (
          <Card style={styles.card}>
            <Text style={styles.title}>Import complete</Text>
            <Text style={styles.body}>
              {result.created} created, {result.stockBatches} opening batch{result.stockBatches === 1 ? "" : "es"} added, {result.failed} failed (of {result.total} rows).
            </Text>
            {result.errors.length > 0 && (
              <View style={styles.errorList}>
                <Text style={styles.errorListTitle}>First {result.errors.length} issue{result.errors.length === 1 ? "" : "s"}:</Text>
                {result.errors.map((e, i) => (
                  <Text key={i} style={styles.errorListItem}>Row {e.row} ({e.name}): {e.error}</Text>
                ))}
              </View>
            )}
          </Card>
        )}
      </ScrollView>
    </Screen>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    scrollContent: { gap: 12, paddingBottom: 24 },
    card: { gap: 10 },
    title: { fontSize: 15, fontWeight: "700", color: theme.text },
    body: { fontSize: 13, color: theme.textSecondary, lineHeight: 19 },
    actionsRow: { flexDirection: "row", gap: 8 },
    actionButton: { flex: 1 },
    error: { color: theme.red, fontSize: 13 },
    previewRow: { fontSize: 12, color: theme.textSecondary },
    centered: { alignItems: "center", gap: 8, paddingVertical: 12 },
    errorList: { gap: 4, marginTop: 4, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 8 },
    errorListTitle: { fontSize: 12, fontWeight: "700", color: theme.textSecondary },
    errorListItem: { fontSize: 12, color: theme.red },
  })
}
