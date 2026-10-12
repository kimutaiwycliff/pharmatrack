import { formatKES, type Cents } from "@pharmatrack/core"
import type { TextProps } from "react-native"
import { AnimatedNumber } from "./AnimatedNumber"
import { Text, type TextTone } from "./Text"
import type { TypeVariant } from "../theme/tokens"

interface MoneyProps extends Omit<TextProps, "children"> {
  cents: Cents
  variant?: TypeVariant
  tone?: TextTone
  align?: "left" | "center" | "right"
  /** Roll to new values (~250 ms) instead of jumping — totals that change as the cart changes. */
  animate?: boolean
}

/** KES amount from integer cents (ADR-008) — formatting lives in @pharmatrack/core. */
export function Money({ cents, variant = "bodyStrong", tone, animate, ...rest }: MoneyProps) {
  if (animate) {
    return <AnimatedNumber value={cents} format={formatKES} variant={variant} tone={tone} align={rest.align} style={rest.style} />
  }
  return (
    <Text variant={variant} tone={tone} tabular {...rest}>
      {formatKES(cents)}
    </Text>
  )
}
