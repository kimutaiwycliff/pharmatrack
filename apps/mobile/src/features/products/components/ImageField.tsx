import Ionicons from "@expo/vector-icons/Ionicons"
import { useState } from "react"
import { StyleSheet, View } from "react-native"
import { Button, Text } from "../../../components"
import { errorMessage } from "../../../lib/api"
import { env } from "../../../lib/env"
import { toast } from "../../../lib/toast"
import { useTheme } from "../../../theme/useTheme"
import { space } from "../../../theme/tokens"
import { pickProductImage } from "../data"
import { ProductThumb } from "./ProductThumb"

// Product photo picker (web EditProductSheet's ImageUploader). The picked
// image is uploaded right away (or copied on-device in the Offline Edition);
// the product keeps it once the form is saved.
export function ImageField({ value, onChange }: { value: string | null; onChange: (url: string | null) => void }) {
  const theme = useTheme()
  const [busy, setBusy] = useState(false)

  async function pick() {
    setBusy(true)
    try {
      const url = await pickProductImage()
      if (url) onChange(url)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.row}>
      <ProductThumb url={value} size={72} />
      <View style={styles.actions}>
        <Button
          title={busy ? "Uploading…" : value ? "Change photo" : "Add photo"}
          variant="secondary"
          size="sm"
          onPress={pick}
          loading={busy}
          leadingIcon={<Ionicons name="image-outline" size={18} color={theme.text} />}
        />
        {value ? <Button title="Remove photo" variant="ghost" size="sm" onPress={() => onChange(null)} disabled={busy} /> : null}
        <Text variant="caption" tone="tertiary">
          {env.EXPO_PUBLIC_OFFLINE_MODE ? "Saved on this device" : "JPG, PNG or WebP · max 5 MB"}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.lg },
  actions: { flex: 1, gap: space.xs, alignItems: "flex-start" },
})
