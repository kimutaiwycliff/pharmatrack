import { Text as RNText, type TextProps as RNTextProps } from "react-native"
import { useTheme } from "../theme/useTheme"
import { typography, type Theme, type TypeVariant } from "../theme/tokens"

export type TextTone = "default" | "secondary" | "tertiary" | "success" | "danger" | "warning" | "inverse"

interface TextProps extends RNTextProps {
  variant?: TypeVariant
  tone?: TextTone
  align?: "left" | "center" | "right"
  /** Tabular figures for money/quantities so columns don't jitter. */
  tabular?: boolean
}

function toneColor(tone: TextTone, theme: Theme): string {
  switch (tone) {
    case "secondary":
      return theme.textSecondary
    case "tertiary":
      return theme.textTertiary
    case "success":
      return theme.green600
    case "danger":
      return theme.red
    case "warning":
      return theme.amber
    case "inverse":
      return theme.onAccent
    default:
      return theme.text
  }
}

// Variant-based text from the type scale in theme/tokens.ts. New UI uses this
// instead of hand-sized RN <Text>; older screens are migrated as they're touched.
export function Text({ variant = "body", tone = "default", align, tabular, style, ...rest }: TextProps) {
  const theme = useTheme()
  return (
    <RNText
      {...rest}
      style={[
        typography[variant],
        { color: toneColor(tone, theme) },
        align ? { textAlign: align } : null,
        tabular ? { fontVariant: ["tabular-nums"] } : null,
        style,
      ]}
    />
  )
}
