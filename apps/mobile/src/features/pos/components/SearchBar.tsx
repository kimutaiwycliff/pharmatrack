import Ionicons from "@expo/vector-icons/Ionicons"
import { forwardRef, useEffect, useRef } from "react"
import type { TextInput } from "react-native"
import { IconButton, TextField } from "../../../components"
import { useTheme } from "../../../theme/useTheme"
import { useHardwareStore } from "../../../lib/hardware/store"
import { createBurstDetector } from "../logic/scanBurst"

interface SearchBarProps {
  value: string
  onChangeText: (text: string) => void
  /** A hardware-scanner burst ending in Enter landed in this field. */
  onScan: (code: string) => void
  /** Enter pressed after normal typing. */
  onSubmitSearch: (text: string) => void
  onFocusChange?: (focused: boolean) => void
}

// Always-visible POS search. USB/Bluetooth scanners type into whatever field
// is focused, so a fast burst ending in Enter is treated as a scan (the code
// is looked up, the text typed before the burst is put back) — see
// logic/scanBurst.ts. When nothing is focused, HardwareScanCatcher catches it.
export const SearchBar = forwardRef<TextInput, SearchBarProps>(function SearchBar(
  { value, onChangeText, onScan, onSubmitSearch, onFocusChange },
  ref,
) {
  const theme = useTheme()
  const burst = useRef(createBurstDetector())
  // Latest text as typed — a scanner's Enter can arrive before React has
  // re-rendered with the last characters, so `value` may still be stale.
  const latest = useRef(value)

  // Cleared/replaced from outside (new sale, recent-scan chip): start fresh so
  // the next burst is measured from the new text.
  useEffect(() => {
    if (value !== latest.current) {
      latest.current = value
      burst.current.reset()
      burst.current.change(value, 0)
    }
  }, [value])

  return (
    <TextField
      ref={ref}
      label="Search products"
      hideLabel
      placeholder="Search name, generic, strength or scan"
      value={value}
      onChangeText={(text) => {
        latest.current = text
        burst.current.change(text, Date.now())
        onChangeText(text)
      }}
      onSubmitEditing={() => {
        const result = burst.current.submit(latest.current, Date.now())
        if (result.kind === "scan") {
          latest.current = result.rest
          onChangeText(result.rest)
          useHardwareStore.getState().markScan() // scanner heartbeat for the POS badge
          onScan(result.code)
        } else {
          onSubmitSearch(result.text)
        }
      }}
      onFocus={() => onFocusChange?.(true)}
      onBlur={() => onFocusChange?.(false)}
      submitBehavior="submit"
      returnKeyType="search"
      autoCorrect={false}
      autoCapitalize="none"
      spellCheck={false}
      leading={<Ionicons name="search-outline" size={20} color={theme.textTertiary} />}
      trailing={
        value ? (
          <IconButton
            icon="close-circle"
            accessibilityLabel="Clear search"
            color={theme.textTertiary}
            onPress={() => {
              burst.current.reset()
              latest.current = ""
              onChangeText("")
            }}
          />
        ) : null
      }
    />
  )
})
