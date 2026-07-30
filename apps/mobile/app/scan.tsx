import { useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera"
import { router } from "expo-router"
import { findByBarcode } from "../src/lib/sync/catalogue"
import { useCartStore } from "../src/store/cart"

// GS1 DataMatrix (used for GTIN/batch/expiry on Kenyan pharmacy packaging,
// per CLAUDE.md §6.2) plus common 1D formats — expo-camera's built-in scanner
// supports 'datamatrix' directly, no separate zxing/native module needed.
const BARCODE_TYPES = ["datamatrix", "ean13", "ean8", "code128", "code39", "upc_a", "upc_e", "qr"] as const

export default function Scan() {
  const [permission, requestPermission] = useCameraPermissions()
  const [scanned, setScanned] = useState(false)
  const [notFound, setNotFound] = useState<string | null>(null)
  const addProduct = useCartStore((s) => s.addProduct)

  if (!permission) return <View style={styles.container} />
  if (!permission.granted) {
    requestPermission()
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Camera permission is required to scan barcodes.</Text>
      </View>
    )
  }

  async function onScanned(result: BarcodeScanningResult) {
    if (scanned) return
    setScanned(true)
    setNotFound(null)
    const product = await findByBarcode(result.data)
    if (!product) {
      setNotFound(result.data)
      setScanned(false)
      return
    }
    addProduct(product)
    router.back()
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
        onBarcodeScanned={onScanned}
      />
      {notFound ? <Text style={styles.overlayText}>No product found for &quot;{notFound}&quot;</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  text: { color: "#fff", textAlign: "center", marginTop: 40, padding: 16 },
  overlayText: {
    position: "absolute",
    bottom: 40,
    left: 16,
    right: 16,
    color: "#fff",
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 12,
    borderRadius: 8,
    textAlign: "center",
  },
})
