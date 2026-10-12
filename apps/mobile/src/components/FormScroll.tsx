import type { ReactNode } from "react"
import { KeyboardAvoidingView, ScrollView, StyleSheet, type StyleProp, type ViewStyle } from "react-native"
import { space } from "../theme/tokens"

interface FormScrollProps {
  children: ReactNode
  /** Sticky actions under the form (e.g. Save) — stays above the keyboard. */
  footer?: ReactNode
  contentStyle?: StyleProp<ViewStyle>
}

// R3: every form screen wraps its fields in this so the focused input is never
// hidden behind the keyboard. "padding" on both platforms: the app is
// edge-to-edge on Android, where the window doesn't resize for the keyboard.
export function FormScroll({ children, footer, contentStyle }: FormScrollProps) {
  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, contentStyle]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {footer}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: space.md, paddingBottom: space.xxl },
})
