import { useCallback, useRef, useState } from "react"
import { StyleSheet, TextInput } from "react-native"
import { useFocusEffect } from "expo-router"
import { parseBarcode, type BarcodeScanEvent, COMPLETION_TIMEOUT_MS, canAcceptScan } from "@pharmatrack/core"

interface Props {
  onScan: (event: BarcodeScanEvent) => void
  enabled?: boolean
}

// Catches USB/Bluetooth-HID barcode scanners: the OS delivers them as
// ordinary hardware-keyboard input to whatever text field has focus, so this
// renders an off-screen TextInput that stays focused while its screen is
// active — mirroring apps/web/lib/barcode/useBarcodeScanner.ts's
// document-level keydown listener, adapted to React Native (no DOM to attach
// a global listener to). Uses onChangeText + onSubmitEditing rather than
// onKeyPress: RN's onKeyPress is unreliable for reporting actual character
// keys on Android, while onChangeText/onSubmitEditing is the standard
// reliable pattern for hardware-keyboard capture on both platforms.
// showSoftInputOnFocus keeps the on-screen keyboard from popping up over the
// real UI while this stays logically focused.
export function HardwareScanCatcher({ onScan, enabled = true }: Props) {
  const inputRef = useRef<TextInput>(null)
  const [value, setValue] = useState("")
  const lastScanTimeRef = useRef(0)
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onScanRef = useRef(onScan)
  // Keep the latest callback without re-subscribing timers/effects.
  // eslint-disable-next-line react-hooks/refs
  onScanRef.current = onScan

  const flush = useCallback((raw: string) => {
    if (completionTimerRef.current) {
      clearTimeout(completionTimerRef.current)
      completionTimerRef.current = null
    }
    setValue("")

    const trimmed = raw.trim()
    const now = Date.now()
    if (!canAcceptScan(trimmed.length, now, lastScanTimeRef.current)) return
    lastScanTimeRef.current = now
    onScanRef.current(parseBarcode(trimmed))
  }, [])

  const handleChangeText = useCallback(
    (text: string) => {
      setValue(text)
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
      completionTimerRef.current = setTimeout(() => flush(text), COMPLETION_TIMEOUT_MS)
    },
    [flush],
  )

  const handleSubmit = useCallback(() => flush(value), [flush, value])

  useFocusEffect(
    useCallback(() => {
      if (enabled) inputRef.current?.focus()
      return () => {
        if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
      }
    }, [enabled]),
  )

  if (!enabled) return null

  return (
    <TextInput
      ref={inputRef}
      value={value}
      onChangeText={handleChangeText}
      onSubmitEditing={handleSubmit}
      blurOnSubmit={false}
      showSoftInputOnFocus={false}
      autoFocus
      autoCorrect={false}
      autoCapitalize="none"
      spellCheck={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.hidden}
    />
  )
}

const styles = StyleSheet.create({
  hidden: { position: "absolute", top: -1000, left: 0, height: 1, width: 1, opacity: 0 },
})
