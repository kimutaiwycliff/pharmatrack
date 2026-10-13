import { useState } from "react"
import { StyleSheet, View } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { router } from "expo-router"
import { File } from "expo-file-system"
import { verifyLicenseRaw, storeLicenseRaw } from "../src/lib/license"
import { useTheme } from "../src/theme/useTheme"
import { space } from "../src/theme/tokens"
import { Button, FormScroll, Screen, Text } from "../src/components"
import { errorMessage } from "../src/lib/api"

// ADR-014, Phase 3 — shown by app/index.tsx's OfflineIndex before ANYTHING
// else (even the first-run /setup wizard) when no valid license is stored,
// mirroring apps/desktop's native-dialog gate ahead of Postgres/Next. Picks
// a .ptlicense file, verifies its signature on-device (zero network calls,
// same as the rest of this build), and stores it for future launches —
// which still re-verify the signature every time, not just once.
export default function License() {
  const theme = useTheme()
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
      setError(errorMessage(err, "Couldn't read that licence file. Make sure you picked the file you were sent, then try again."))
    } finally {
      setPending(false)
    }
  }

  return (
    <Screen>
      <FormScroll contentStyle={styles.content}>
        <View style={styles.brand}>
          <Ionicons name="document-lock-outline" size={48} color={theme.green} />
          <Text variant="title" align="center" accessibilityRole="header">
            PharmaTrack Offline Edition
          </Text>
          <Text tone="secondary" align="center">
            This device needs a license file before it can be set up. Your PharmaTrack license file was provided when you
            purchased Offline Edition — select it below.
          </Text>
        </View>

        {error ? (
          <Text tone="danger" align="center" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        <Button
          title="Select license file"
          size="lg"
          onPress={pickAndVerify}
          loading={pending}
          leadingIcon={<Ionicons name="folder-open-outline" size={20} color={theme.onAccent} />}
        />
      </FormScroll>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: space.sm, paddingVertical: space.xl, gap: space.md },
  brand: { alignItems: "center", gap: space.sm, marginBottom: space.sm },
})
