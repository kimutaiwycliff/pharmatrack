import Ionicons from "@expo/vector-icons/Ionicons"
import { StyleSheet, View } from "react-native"
import { env } from "../lib/env"
import { useSyncStore } from "../store/sync"
import { useTheme } from "../theme/useTheme"
import { space } from "../theme/tokens"
import { Button } from "./Button"
import { Text } from "./Text"

/** False in the Offline Edition, or while the phone has no connection. */
export function useIsOnline(): boolean {
  const online = useSyncStore((s) => s.online)
  return !env.EXPO_PUBLIC_OFFLINE_MODE && online
}

interface NeedsInternetProps {
  /** What needs the connection, e.g. "Purchase orders". */
  feature: string
  onRetry?: () => void
}

// R3: shown by online-only screens (purchase orders, sync issues, dashboard…)
// when there's no connection, instead of a confusing network error. In the
// Offline Edition these screens are hidden from navigation altogether; this
// is the backstop if one is reached anyway.
export function NeedsInternet({ feature, onRetry }: NeedsInternetProps) {
  const theme = useTheme()
  const offlineEdition = env.EXPO_PUBLIC_OFFLINE_MODE
  return (
    <View style={styles.block} accessibilityLiveRegion="polite">
      <Ionicons name="cloud-offline-outline" size={40} color={theme.textTertiary} />
      <Text variant="headline" align="center">
        {offlineEdition ? `${feature} isn't part of the Offline Edition` : "Needs internet"}
      </Text>
      <Text tone="secondary" align="center">
        {offlineEdition
          ? "This screen talks to the PharmaTrack server, which this edition doesn't use."
          : `${feature} loads from the server. Selling keeps working offline — come back here once you're connected.`}
      </Text>
      {onRetry && !offlineEdition ? <Button title="Try again" variant="secondary" onPress={onRetry} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  block: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.sm, padding: space.xl },
})
