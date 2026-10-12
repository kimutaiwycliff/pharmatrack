import { Pressable, StyleSheet, Text, View } from "react-native"
import { router } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"
import { useSyncStore } from "../store/sync"
import { nairobiClock } from "../lib/sync/core/format"
import { useTheme } from "../theme/useTheme"
import type { Theme } from "../theme/tokens"

// Persistent, non-blocking sync notices (R1 rules 3 + 5): the 21:00 "sync
// before midnight" warning, a shift that was closed offline and still has to
// upload, a manager unlock in force, and a lapsed subscription. Each opens
// the sync screen. Renders nothing when there's nothing to say.
export function SyncBanners() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const { device, lock, pendingSales, pendingShiftCloses, override, subscriptionInactive } = useSyncStore()
  if (!device) return null

  const banners: { key: string; icon: keyof typeof Ionicons.glyphMap; text: string; tone: "warn" | "danger" }[] = []
  if (lock.warnDeadline && pendingSales > 0) {
    banners.push({
      key: "deadline",
      icon: "alarm-outline",
      text: `Sync before midnight — ${pendingSales} sale${pendingSales === 1 ? "" : "s"} waiting`,
      tone: "warn",
    })
  }
  if (pendingShiftCloses > 0) {
    banners.push({ key: "shift", icon: "cloud-upload-outline", text: "Shift closed — waiting to sync. Connect to upload it.", tone: "warn" })
  }
  if (lock.underOverride && override) {
    banners.push({
      key: "override",
      icon: "key-outline",
      text: `Unlocked by ${override.manager_name} until ${nairobiClock(override.until)} — sync as soon as you can`,
      tone: "warn",
    })
  }
  if (subscriptionInactive) {
    banners.push({ key: "sub", icon: "card-outline", text: "Subscription inactive — renew to keep syncing", tone: "danger" })
  }
  if (banners.length === 0) return null

  return (
    <View style={styles.wrap}>
      {banners.map((b) => (
        <Pressable
          key={b.key}
          onPress={() => router.push("/sync")}
          style={[styles.banner, b.tone === "danger" ? styles.danger : styles.warn]}
          accessibilityRole="button"
        >
          <Ionicons name={b.icon} size={18} color={b.tone === "danger" ? theme.red : theme.amber} />
          <Text style={styles.text}>{b.text}</Text>
        </Pressable>
      ))}
    </View>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    wrap: { gap: 6 },
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minHeight: 48,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
    },
    warn: { borderColor: theme.amber, backgroundColor: theme.muted },
    danger: { borderColor: theme.red, backgroundColor: theme.red50 },
    text: { flex: 1, fontSize: 14, fontWeight: "600", color: theme.text },
  })
}
