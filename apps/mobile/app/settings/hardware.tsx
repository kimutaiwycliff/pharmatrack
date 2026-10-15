import Ionicons from "@expo/vector-icons/Ionicons"
import { useState } from "react"
import { Linking, StyleSheet, View } from "react-native"
import { parseBarcode, receiptPreview, type DeviceHealth, type PaperWidth, type ReceiptDoc } from "@pharmatrack/core"
import { Button, Card, Chip, FormScroll, ListRow, Screen, ScreenHeader, Text, TextField } from "../../src/components"
import { ToggleRow } from "../../src/features/products/components/ToggleRow"
import { userMessage } from "../../src/lib/errors"
import { parseNetworkTarget, targetLabel, type PrinterTarget } from "../../src/lib/hardware/logic"
import { hardwareAvailable } from "../../src/lib/hardware/native"
import { ensureUsbPermission, findPrinters, paperFor, printTestPage, refreshPrinterStatus, type PrinterChoice } from "../../src/lib/hardware/printer"
import { useHardwareStore } from "../../src/lib/hardware/store"
import { useDeviceHealth } from "../../src/lib/hardware/useDeviceHealth"
import { toast } from "../../src/lib/toast"
import { useTheme } from "../../src/theme/useTheme"
import { space } from "../../src/theme/tokens"

// Settings → Printer & scanner (this phone/tablet only). Pick a receipt
// printer — paired Bluetooth (incl. a Sunmi terminal's built-in one), USB, or
// a network printer by IP — then paper width, auto-print, cash drawer and
// copies. Shows live printer + scanner health, a test page, a sample-receipt
// preview (no printer needed) and a scan-test box.

const SAMPLE: ReceiptDoc = {
  shopName: "Your Pharmacy", receiptNumber: "R-000123", dateText: "15/10/2026 14:05", cashier: "Jane",
  lines: [
    { name: "Paracetamol 500mg", qtyLabel: "20 tablets", totalCents: 4000 },
    { name: "Amoxicillin 500mg Capsules", qtyLabel: "21 capsules", totalCents: 21000, discountCents: 1000 },
  ],
  subtotalCents: 25000, discountCents: 1000, totalCents: 24000, paymentLabel: "Cash", paidCents: 50000, changeCents: 26000,
}

type Found = { choices: PrinterChoice[]; bluetoothOff: boolean; bluetoothDenied: boolean }

export default function HardwareSettings() {
  const theme = useTheme()
  const settings = useHardwareStore((s) => s.settings)
  const inputDevices = useHardwareStore((s) => s.inputDevices)
  const update = useHardwareStore((s) => s.update)
  const markScan = useHardwareStore((s) => s.markScan)
  const { printer, scanner } = useDeviceHealth()
  const [busy, setBusy] = useState<string | null>(null)
  const [found, setFound] = useState<Found | null>(null)
  const [ip, setIp] = useState(settings.target?.kind === "network" ? settings.target.address : "")
  const [port, setPort] = useState(settings.target?.kind === "network" ? String(settings.target.port) : "9100")
  const [ipError, setIpError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [scanText, setScanText] = useState("")
  const [scanResult, setScanResult] = useState<string | null>(null)
  const native = hardwareAvailable()
  const paper = paperFor(settings)
  const target = settings.target

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key)
    try {
      await fn()
    } catch (err) {
      toast.error(userMessage(err, "Something went wrong with the printer"))
    } finally {
      setBusy(null)
    }
  }

  function choose(t: PrinterTarget) {
    void run(`pick:${t.address}`, async () => {
      await ensureUsbPermission(t)
      update({ target: t })
      toast.success(`${t.label} selected`)
      await refreshPrinterStatus()
    })
  }

  function saveNetwork() {
    const r = parseNetworkTarget(ip, port)
    if (!r.ok) {
      setIpError(r.error)
      return
    }
    setIpError(null)
    choose({ kind: "network", address: r.host, port: r.port, label: targetLabel("network", r.host) })
  }

  function onScanSubmit() {
    const code = scanText.trim()
    if (!code) return
    markScan()
    const ev = parseBarcode(code)
    setScanResult(ev.gtin ? `Read GTIN ${ev.gtin}${ev.batchNumber ? `, batch ${ev.batchNumber}` : ""}` : `Read “${code}”`)
    setScanText("")
  }

  return (
    <Screen edges={["top", "left", "right"]}>
      <ScreenHeader title="Printer & scanner" subtitle="Saved on this device" />
      <FormScroll>
        {!native ? (
          <Card style={styles.card}>
            <Text variant="bodyStrong">Update the app to print directly</Text>
            <Text variant="caption" tone="secondary">
              This version can’t talk to receipt printers yet. Update PharmaTrack to version 1.3 or newer. Until then, share receipts as a PDF or by WhatsApp.
            </Text>
          </Card>
        ) : null}

        <Card style={styles.card}>
          <Text variant="headline" accessibilityRole="header">
            Receipt printer
          </Text>
          <HealthLine health={printer} />
          {target ? (
            <View style={styles.row}>
              <Button title="Check now" variant="secondary" size="sm" onPress={() => void run("check", refreshPrinterStatus)} loading={busy === "check"} style={styles.flex} />
              <Button
                title="Print test page"
                size="sm"
                onPress={() => void run("test", async () => {
                  await printTestPage(target, paper)
                  toast.success("Test page sent")
                  await refreshPrinterStatus()
                })}
                loading={busy === "test"}
                style={styles.flex}
              />
            </View>
          ) : null}
          <Button title={showPreview ? "Hide sample receipt" : "Preview a sample receipt"} variant="ghost" size="sm" onPress={() => setShowPreview((v) => !v)} />
          {showPreview ? (
            <View style={[styles.preview, { borderColor: theme.border }]}>
              <Text style={styles.mono} accessibilityLabel="Sample receipt">
                {receiptPreview(SAMPLE, paper).join("\n")}
              </Text>
            </View>
          ) : null}
        </Card>

        {native ? (
          <Card style={styles.card}>
            <Text variant="headline" accessibilityRole="header">
              Choose the printer
            </Text>
            <Text variant="caption" tone="secondary">
              Pair a Bluetooth printer first in Android’s Bluetooth settings (PIN is usually 0000 or 1234). Sunmi terminals show their own printer as “Built-in printer”.
            </Text>
            <View style={styles.row}>
              <Button
                title="Find printers"
                onPress={() => void run("find", async () => setFound(await findPrinters()))}
                loading={busy === "find"}
                style={styles.flex}
                leadingIcon={<Ionicons name="search" size={18} color={theme.onAccent} />}
              />
              <Button
                title="Bluetooth settings"
                variant="secondary"
                onPress={() => void Linking.sendIntent("android.settings.BLUETOOTH_SETTINGS").catch(() => Linking.openSettings())}
                style={styles.flex}
              />
            </View>
            {found?.bluetoothOff ? <Text variant="caption" tone="warning">Bluetooth is off — switch it on to see Bluetooth printers.</Text> : null}
            {found?.bluetoothDenied ? <Text variant="caption" tone="warning">Allow “Nearby devices” for PharmaTrack to see Bluetooth printers.</Text> : null}
            {found && found.choices.length === 0 ? (
              <Text variant="caption" tone="secondary">No printers found. Pair a Bluetooth printer, plug in a USB one, or add a network printer below.</Text>
            ) : null}
            {found?.choices.map((c) => {
              const selected = target?.kind === c.target.kind && target.address === c.target.address
              return (
                <ListRow
                  key={`${c.target.kind}:${c.target.address}`}
                  title={c.target.label}
                  subtitle={c.hint}
                  onPress={() => choose(c.target)}
                  leading={<Ionicons name={c.target.kind === "usb" ? "hardware-chip-outline" : "bluetooth"} size={22} color={theme.text} />}
                  trailing={selected ? <Ionicons name="checkmark-circle" size={22} color={theme.green} /> : undefined}
                />
              )
            })}
            <View style={styles.row}>
              <TextField
                label="Network printer IP"
                value={ip}
                onChangeText={setIp}
                placeholder="192.168.1.100"
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
                error={ipError}
                containerStyle={styles.grow}
              />
              <TextField label="Port" value={port} onChangeText={setPort} keyboardType="number-pad" containerStyle={styles.flex} />
            </View>
            <Button title="Use network printer" variant="secondary" onPress={saveNetwork} />
            <Text variant="caption" tone="tertiary">
              Hold the printer’s FEED button while switching it on to print its IP address.
            </Text>
            {target ? (
              <Button
                title={`Forget ${target.label}`}
                variant="ghost"
                size="sm"
                onPress={() => {
                  update({ target: null })
                  useHardwareStore.getState().setPrinter(null)
                }}
              />
            ) : null}
          </Card>
        ) : null}

        <Card style={styles.card}>
          <Text variant="headline" accessibilityRole="header">
            Receipt options
          </Text>
          <Text variant="label" tone="secondary">
            Paper width
          </Text>
          <View style={styles.chips}>
            {(["58mm", "80mm"] as PaperWidth[]).map((p) => (
              <Chip key={p} label={p === "58mm" ? "58 mm (small)" : "80 mm (standard)"} selected={paper === p} onPress={() => update({ paper: p })} />
            ))}
          </View>
          <Text variant="label" tone="secondary">
            Copies per sale
          </Text>
          <View style={styles.chips}>
            {[1, 2, 3].map((n) => (
              <Chip key={n} label={String(n)} selected={settings.copies === n} onPress={() => update({ copies: n })} />
            ))}
          </View>
          <ToggleRow label="Print automatically after each sale" description="No need to tap Print" value={settings.autoPrint} onChange={(v) => update({ autoPrint: v })} disabled={!target} />
          <ToggleRow label="Open the cash drawer for cash sales" description="For a drawer plugged into the printer" value={settings.openDrawer} onChange={(v) => update({ openDrawer: v })} disabled={!target} />
        </Card>

        <Card style={styles.card}>
          <Text variant="headline" accessibilityRole="header">
            Barcode scanner
          </Text>
          <HealthLine health={scanner} />
          {inputDevices && inputDevices.length > 0 ? (
            <Text variant="caption" tone="secondary">
              Connected: {inputDevices.map((d) => d.name).join(", ")}
            </Text>
          ) : null}
          <TextField
            label="Test your scanner"
            value={scanText}
            onChangeText={setScanText}
            placeholder="Tap here, then scan any barcode"
            autoCapitalize="none"
            autoCorrect={false}
            showSoftInputOnFocus={false}
            onSubmitEditing={onScanSubmit}
          />
          {scanResult ? (
            <Text variant="caption" tone="success" accessibilityLiveRegion="polite">
              {scanResult} — the scanner works.
            </Text>
          ) : null}
          <Text variant="caption" tone="tertiary">
            Use the scanner in keyboard (HID) mode with Enter after each scan. Bluetooth: pair it in Android’s Bluetooth settings — it shows up as a keyboard. USB: plug it in with an OTG adapter. Choose a 2D scanner to read the square codes (with batch and expiry) on medicine packs.
          </Text>
        </Card>
      </FormScroll>
    </Screen>
  )
}

function HealthLine({ health }: { health: DeviceHealth }) {
  const tone = health.tone === "ok" ? "success" : health.tone === "warn" ? "warning" : health.tone === "down" ? "danger" : "secondary"
  return (
    <View accessibilityLiveRegion="polite">
      <Text variant="bodyStrong" tone={tone}>
        {health.label}
      </Text>
      {health.detail ? (
        <Text variant="caption" tone="secondary">
          {health.detail}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { gap: space.sm },
  row: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
  flex: { flex: 1 },
  grow: { flex: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  preview: { borderWidth: 1, borderStyle: "dashed", borderRadius: 8, padding: space.sm, backgroundColor: "#fff" },
  mono: { fontFamily: "monospace", fontSize: 10, lineHeight: 14, color: "#000" },
})
