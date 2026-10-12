import { useEffect, useRef, useState } from "react"
import { Linking, StyleSheet, View } from "react-native"
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera"
import { router, Stack } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Button, IconButton, Text } from "../src/components"
import { addScanned } from "../src/features/pos/actions"
import { useCartStore } from "../src/store/cart"
import { useTheme } from "../src/theme/useTheme"
import { radius, space } from "../src/theme/tokens"
import { cartTotals } from "../src/features/pos/logic/cart"
import { formatKES } from "@pharmatrack/core"

// GS1 DataMatrix (GTIN/batch/expiry on Kenyan pharmacy packaging, CLAUDE.md
// §6.2) plus common 1D formats — expo-camera's built-in scanner handles them.
const BARCODE_TYPES = ["datamatrix", "ean13", "ean8", "code128", "code39", "upc_a", "upc_e", "qr"] as const
/** The same code is ignored for this long, so holding a box in view adds it once. */
const SAME_CODE_MS = 1500
const FRAME = 260

// R2 camera scanner: stays open (continuous mode) so a cashier can scan a
// whole basket, then Done. Each hit gets a success haptic + toast with the
// product name (via addScanned — same cap/top-up rules as the POS); unknown
// codes get an error haptic. Lookup is GS1-aware, pack barcodes add the pack.
export default function Scan() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [permission, requestPermission] = useCameraPermissions()
  const [torch, setTorch] = useState(false)
  const [lastAdded, setLastAdded] = useState<string | null>(null)
  const last = useRef<{ code: string; at: number }>({ code: "", at: 0 })
  const busy = useRef(false)
  const items = useCartStore((s) => s.items)
  const totals = cartTotals(items)

  // Ask once on open; after a "don't ask again" only Settings can grant it.
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission()
  }, [permission, requestPermission])

  async function onScanned(result: BarcodeScanningResult) {
    const code = result.data.trim()
    const now = Date.now()
    if (!code || busy.current) return
    if (code === last.current.code && now - last.current.at < SAME_CODE_MS) return
    last.current = { code, at: now }
    busy.current = true
    try {
      const name = await addScanned(code)
      if (name) setLastAdded(name)
    } finally {
      busy.current = false
    }
  }

  const closeButton = (
    <IconButton icon="close" variant="tonal" accessibilityLabel="Close scanner" onPress={() => router.back()} />
  )

  if (!permission) return <View style={[styles.fill, { backgroundColor: theme.bg }]} />

  if (!permission.granted) {
    return (
      <View style={[styles.fill, styles.denied, { backgroundColor: theme.bg, paddingTop: insets.top + space.lg }]}>
        <Stack.Screen options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
        <View style={styles.deniedClose}>{closeButton}</View>
        <Ionicons name="camera-outline" size={56} color={theme.textSecondary} />
        <Text variant="title" align="center">
          Camera access needed
        </Text>
        <Text tone="secondary" align="center">
          PharmaTrack uses the camera only to read barcodes on medicine packs. Nothing is recorded or uploaded.
        </Text>
        {permission.canAskAgain ? <Button title="Allow camera" onPress={() => void requestPermission()} /> : null}
        <Button
          title="Open settings"
          variant={permission.canAskAgain ? "secondary" : "primary"}
          onPress={() => void Linking.openSettings()}
          leadingIcon={<Ionicons name="settings-outline" size={18} color={permission.canAskAgain ? theme.text : theme.onAccent} />}
        />
        <Button title="Close" variant="ghost" onPress={() => router.back()} />
      </View>
    )
  }

  return (
    <View style={[styles.fill, { backgroundColor: theme.scrim }]}>
      <Stack.Screen options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
        onBarcodeScanned={(r) => void onScanned(r)}
      />

      {/* Viewfinder: dimmed surround with a clear frame in the middle. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={[styles.flex, { backgroundColor: theme.scrim }]} />
        <View style={styles.frameRow}>
          <View style={[styles.flex, { backgroundColor: theme.scrim }]} />
          <View style={[styles.frame, { borderColor: theme.green }]} accessibilityElementsHidden />
          <View style={[styles.flex, { backgroundColor: theme.scrim }]} />
        </View>
        <View style={[styles.flex, { backgroundColor: theme.scrim }]} />
      </View>

      <View style={[styles.topBar, { paddingTop: insets.top + space.sm }]}>
        {closeButton}
        <Text variant="headline" style={{ color: theme.onAccent }}>
          Scan items
        </Text>
        <IconButton
          icon={torch ? "flash" : "flash-off"}
          variant="tonal"
          selected={torch}
          accessibilityLabel={torch ? "Turn torch off" : "Turn torch on"}
          onPress={() => setTorch((t) => !t)}
        />
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + space.lg }]}>
        <Text align="center" style={{ color: theme.onAccent }} accessibilityLiveRegion="polite">
          {lastAdded ? `Added ${lastAdded}` : "Point at a barcode — keep scanning, each item is added"}
        </Text>
        <Button
          title={totals.count > 0 ? `Done · ${totals.count} item${totals.count === 1 ? "" : "s"} · ${formatKES(totals.total)}` : "Done"}
          size="lg"
          onPress={() => router.back()}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  denied: { alignItems: "center", justifyContent: "center", gap: space.lg, paddingHorizontal: space.xl },
  deniedClose: { position: "absolute", top: space.xxxl, right: space.lg },
  frameRow: { flexDirection: "row", height: FRAME },
  frame: { width: FRAME, height: FRAME, borderWidth: 3, borderRadius: radius.lg },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
  },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg, gap: space.md },
})
