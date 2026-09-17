import { useState } from "react"
import { StyleSheet, Text } from "react-native"
import { router } from "expo-router"
import { File } from "expo-file-system"
import { verifyLicenseRaw, storeLicenseRaw } from "../src/lib/license"
import { useTheme } from "../src/theme/useTheme"
import type { Theme } from "../src/theme/tokens"
import { Button, Screen } from "../src/components"

// ADR-014, Phase 3 — shown by app/index.tsx's OfflineIndex before ANYTHING
// else (even the first-run /setup wizard) when no valid license is stored,
// mirroring apps/desktop's native-dialog gate ahead of Postgres/Next. Picks
// a .ptlicense file, verifies its signature on-device (zero network calls,
// same as the rest of this build), and stores it for future launches —
// which still re-verify the signature every time, not just once.
export default function License() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function pickAndVerify() {
    setError(null)
    setPending(true)
    try {
      const pick = await File.pickFileAsync({ mimeTypes: "*/*" })
      if (pick.canceled) return
      const raw = await pick.result.text()
      const result = verifyLicenseRaw(raw)
      if (!result.valid) {
        setError(result.error)
        return
      }
      await storeLicenseRaw(raw)
      router.replace("/")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file")
    } finally {
      setPending(false)
    }
  }

  return (
    <Screen style={styles.container}>
      <Text style={styles.title}>PharmaTrack Offline Edition</Text>
      <Text style={styles.subtitle}>
        This device needs a license file before it can be set up. Your PharmaTrack license file
        was provided when you purchased Offline Edition — select it below.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button title="Select license file" onPress={pickAndVerify} loading={pending} style={styles.button} />
    </Screen>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { justifyContent: "center", padding: 24, gap: 12 },
    title: { fontSize: 24, fontWeight: "700", textAlign: "center", color: theme.text },
    subtitle: { fontSize: 14, textAlign: "center", color: theme.textSecondary, marginBottom: 8 },
    button: { marginTop: 8 },
    error: { color: theme.red, textAlign: "center" },
  })
}
