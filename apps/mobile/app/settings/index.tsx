import Ionicons from "@expo/vector-icons/Ionicons"
import type { ComponentProps } from "react"
import { ScrollView, StyleSheet, View } from "react-native"
import { router } from "expo-router"
import { Chip, ListRow, Screen, ScreenHeader, Text, useIsOnline } from "../../src/components"
import { SettingsSection } from "../../src/features/settings/components/SettingsSection"
import { roleLabel } from "../../src/features/staff/logic/staff"
import { useCan } from "../../src/hooks/useCan"
import { confirmSignOut } from "../../src/lib/auth-client"
import { formatDateTime } from "../../src/lib/dates"
import { env } from "../../src/lib/env"
import { appVersion } from "../../src/lib/sync/device"
import { timeAgo } from "../../src/lib/sync/core/format"
import { useSessionStore } from "../../src/store/session"
import { useStaffStore } from "../../src/store/staff"
import { useSyncStore } from "../../src/store/sync"
import { useTheme, useThemeMode, type ThemeMode } from "../../src/theme/useTheme"
import { space } from "../../src/theme/tokens"

// R3 Settings: a grouped menu, like web's Settings tabs (CLAUDE.md §6.11) —
// My profile, Security (PIN / password), Appearance, This device (R1 sync),
// Organisation (settings.organization only) and Log out. Each form lives on
// its own sub-screen under app/settings/ so the keyboard and validation have
// room. This menu itself needs no data, so it works with no connection; the
// forms load GET /api/settings (or the Offline Edition's local repo).

type IconName = ComponentProps<typeof Ionicons>["name"]

const MODES: { mode: ThemeMode; label: string; icon: IconName }[] = [
  { mode: "system", label: "System", icon: "phone-portrait-outline" },
  { mode: "light", label: "Light", icon: "sunny-outline" },
  { mode: "dark", label: "Dark", icon: "moon-outline" },
]

const OFFLINE = env.EXPO_PUBLIC_OFFLINE_MODE

export default function Settings() {
  const theme = useTheme()
  const can = useCan()
  const online = useIsOnline()
  const { mode, setMode } = useThemeMode()
  const staff = useStaffStore((s) => s.current)
  const sessionRole = useSessionStore((s) => s.role)
  const device = useSyncStore((s) => s.device)
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt)
  const pendingCount = useSyncStore((s) => s.pendingCount)
  const rejectedCount = useSyncStore((s) => s.rejectedCount)

  const role = staff?.role ?? sessionRole
  const chevron = <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
  const icon = (name: IconName, color = theme.text) => <Ionicons name={name} size={22} color={color} />

  return (
    <Screen>
      <ScreenHeader title="Settings" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <SettingsSection title="Profile">
          <ListRow
            title={staff?.name ?? "My profile"}
            subtitle={role ? `${roleLabel(role)} · name and phone number` : "Name and phone number"}
            leading={icon("person-circle-outline")}
            trailing={chevron}
            onPress={() => router.push("/settings/profile")}
            accessibilityLabel="My profile"
            accessibilityHint="Change your name and phone number"
          />
        </SettingsSection>

        <SettingsSection title="Security">
          <ListRow
            title="Till PIN"
            subtitle="Quick sign-in at the till with your phone number"
            leading={icon("keypad-outline")}
            trailing={chevron}
            onPress={() => router.push("/settings/pin")}
            accessibilityHint="Set or change your PIN"
          />
          {OFFLINE ? null : (
            <ListRow
              title="Password"
              subtitle={online ? "Change the password you sign in with" : "Needs internet"}
              leading={icon("lock-closed-outline")}
              trailing={chevron}
              onPress={() => router.push("/settings/password")}
              accessibilityHint="Change your account password"
            />
          )}
        </SettingsSection>

        <SettingsSection title="Appearance" footer="Applies straight away on this phone.">
          <View style={styles.modes} accessibilityRole="radiogroup" accessibilityLabel="Theme">
            {MODES.map((m) => (
              <Chip
                key={m.mode}
                label={m.label}
                selected={mode === m.mode}
                icon={<Ionicons name={m.icon} size={16} color={mode === m.mode ? theme.green600 : theme.text} />}
                accessibilityLabel={`${m.label} theme`}
                onPress={() => setMode(m.mode)}
                style={styles.mode}
              />
            ))}
          </View>
        </SettingsSection>

        {OFFLINE ? null : (
          <SettingsSection title="This device">
            {device ? (
              <ListRow
                title={device.name}
                subtitle={`Device ${device.code}${device.branchName ? ` · ${device.branchName}` : ""}`}
                leading={icon("phone-portrait-outline")}
                trailing={chevron}
                onPress={() => router.push("/sync")}
                accessibilityLabel={`This device, ${device.name}, last synced ${timeAgo(lastSyncAt)}, ${pendingCount} waiting to upload`}
                accessibilityHint="Opens sync status"
                meta={
                  <View style={styles.meta}>
                    <Text variant="caption" tone="secondary">
                      Last synced {timeAgo(lastSyncAt)}
                      {lastSyncAt ? ` (${formatDateTime(new Date(lastSyncAt))})` : ""}
                    </Text>
                    <Text variant="caption" tone={pendingCount > 0 ? "warning" : "secondary"}>
                      {pendingCount === 0 ? "Nothing waiting to upload" : `${pendingCount} waiting to upload`}
                    </Text>
                    {rejectedCount > 0 ? (
                      <Text variant="caption" tone="danger">
                        {rejectedCount} need{rejectedCount === 1 ? "s" : ""} attention
                      </Text>
                    ) : null}
                  </View>
                }
              />
            ) : (
              <ListRow
                title="This phone isn't registered"
                subtitle="A manager registers it once so it can sell offline"
                leading={icon("phone-portrait-outline", theme.amber)}
                trailing={chevron}
                onPress={() => router.push("/sync")}
                accessibilityHint="Opens sync and device registration"
              />
            )}
          </SettingsSection>
        )}

        {can("settings.organization") ? (
          <SettingsSection title="Organisation">
            <ListRow
              title={OFFLINE ? "Pharmacy details" : "Organisation details"}
              subtitle="Name, registration number, contact and address"
              leading={icon("business-outline")}
              trailing={chevron}
              onPress={() => router.push("/settings/organisation")}
            />
          </SettingsSection>
        ) : null}

        <SettingsSection title="Account">
          <ListRow
            title="Log out"
            onPress={confirmSignOut}
            accessibilityHint="Signs this account out of the app"
            leading={icon("log-out-outline", theme.red)}
          />
        </SettingsSection>

        <Text variant="caption" tone="tertiary" align="center">
          PharmaTrack {OFFLINE ? "Offline Edition " : ""}v{appVersion()}
        </Text>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  scroll: { gap: space.lg, paddingBottom: space.xl },
  modes: { flexDirection: "row", gap: space.sm, padding: space.md },
  mode: { flex: 1, justifyContent: "center" },
  meta: { gap: space.xxs, marginTop: space.xxs },
})
