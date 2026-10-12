import Ionicons from "@expo/vector-icons/Ionicons"
import { Image, StyleSheet, View } from "react-native"
import { env } from "../../../lib/env"
import { useTheme } from "../../../theme/useTheme"
import { radius } from "../../../theme/tokens"
import { resolveImageUrl } from "../logic/list"

// Product photo (server /api/media URL or Offline Edition file:// URI), or a
// neutral placeholder. Decorative: the row/heading already names the product.
export function ProductThumb({ url, size = 44 }: { url: string | null | undefined; size?: number }) {
  const theme = useTheme()
  const src = resolveImageUrl(url, env.EXPO_PUBLIC_API_URL)
  const box = { width: size, height: size, borderRadius: radius.md, backgroundColor: theme.mutedStrong, borderColor: theme.border }
  if (src) return <Image source={{ uri: src }} style={[styles.base, box]} accessibilityIgnoresInvertColors accessible={false} />
  return (
    <View style={[styles.base, styles.placeholder, box]} accessible={false}>
      <Ionicons name="medkit-outline" size={Math.round(size * 0.45)} color={theme.textTertiary} />
    </View>
  )
}

const styles = StyleSheet.create({
  base: { borderWidth: StyleSheet.hairlineWidth },
  placeholder: { alignItems: "center", justifyContent: "center" },
})
