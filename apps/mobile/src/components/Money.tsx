import { formatKES, type Cents } from "@pharmatrack/core"
import type { TextProps } from "react-native"
import { Text, type TextTone } from "./Text"
import type { TypeVariant } from "../theme/tokens"

interface MoneyProps extends Omit<TextProps, "children"> {
  cents: Cents
  variant?: TypeVariant
  tone?: TextTone
  align?: "left" | "center" | "right"
}

/** KES amount from integer cents (ADR-008) — formatting lives in @pharmatrack/core. */
export function Money({ cents, variant = "bodyStrong", tone, ...rest }: MoneyProps) {
  return (
    <Text variant={variant} tone={tone} tabular {...rest}>
      {formatKES(cents)}
    </Text>
  )
}
