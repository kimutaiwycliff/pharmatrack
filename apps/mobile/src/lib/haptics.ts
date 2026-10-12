import * as Haptics from "expo-haptics"

// Thin wrapper so call sites read as intent ("added", "failed") and a device
// without a vibrator (or a haptics error) can never break a sale.
const safe = (fn: () => Promise<void>) => {
  fn().catch(() => {})
}

export const haptics = {
  /** Keypad / stepper tick. */
  tick: () => safe(() => Haptics.selectionAsync()),
  /** Item added to the cart. */
  add: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Scan matched / sale completed. */
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Unknown code / blocked action. */
  error: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
}
