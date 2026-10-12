import { BottomSheetTextInput } from "@gorhom/bottom-sheet"
import { forwardRef, useState, type ReactNode } from "react"
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native"
import { useTheme } from "../theme/useTheme"
import { radius, space, TOUCH_TARGET } from "../theme/tokens"
import { Text } from "./Text"

interface TextFieldProps extends Omit<TextInputProps, "style"> {
  label: string
  /** Visually hide the label (it's still announced) — e.g. a search box with an icon. */
  hideLabel?: boolean
  helper?: string | null
  error?: string | null
  leading?: ReactNode
  trailing?: ReactNode
  containerStyle?: StyleProp<ViewStyle>
  inputStyle?: TextInputProps["style"]
  /** Rendered inside a <Sheet>: uses the bottom sheet's own input so the
   *  sheet rises with the keyboard instead of being covered by it. */
  inSheet?: boolean
}

// Labelled input: visible label, helper or error underneath, focus ring, and
// the label/error wired into the accessibility label so TalkBack reads them.
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, hideLabel, helper, error, leading, trailing, containerStyle, inputStyle, inSheet, onFocus, onBlur, ...rest },
  ref,
) {
  const theme = useTheme()
  const [focused, setFocused] = useState(false)
  const borderColor = error ? theme.red : focused ? theme.green : theme.border
  // Same props/ref either way; BottomSheetTextInput tells the sheet about focus.
  const Input = (inSheet ? BottomSheetTextInput : TextInput) as typeof TextInput
  return (
    <View style={[styles.container, containerStyle]}>
      {hideLabel ? null : (
        <Text variant="label" tone="secondary">
          {label}
        </Text>
      )}
      <View style={[styles.field, { borderColor, backgroundColor: theme.surface }, focused && styles.focused]}>
        {leading}
        <Input
          ref={ref}
          placeholderTextColor={theme.textTertiary}
          accessibilityLabel={error ? `${label}, error: ${error}` : label}
          accessibilityHint={helper ?? undefined}
          {...rest}
          onFocus={(e) => {
            setFocused(true)
            onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            onBlur?.(e)
          }}
          style={[styles.input, { color: theme.text }, inputStyle]}
        />
        {trailing}
      </View>
      {error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : helper ? (
        <Text variant="caption" tone="secondary">
          {helper}
        </Text>
      ) : null}
    </View>
  )
})

const styles = StyleSheet.create({
  container: { gap: space.xs },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    minHeight: TOUCH_TARGET,
  },
  focused: { borderWidth: 2, paddingHorizontal: space.md - 1 },
  input: { flex: 1, fontSize: 16, paddingVertical: space.sm },
})
