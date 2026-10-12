import Ionicons from "@expo/vector-icons/Ionicons"
import { useLocalSearchParams } from "expo-router"
import { EmptyState, NeedsInternet, Screen, ScreenHeader, useIsOnline } from "../../src/components"
import { ProductForm } from "../../src/features/products/components/ProductForm"
import { useCan } from "../../src/hooks/useCan"
import { env } from "../../src/lib/env"
import { useTheme } from "../../src/theme/useTheme"

// Add a product (products.create). Optional `gtin` / `name` params prefill the
// form, e.g. from an unknown scan. Online it POSTs /api/products; the Offline
// Edition writes the local database (see features/products/data).
export default function NewProductScreen() {
  const { gtin, name } = useLocalSearchParams<{ gtin?: string; name?: string }>()
  const theme = useTheme()
  const can = useCan()
  const online = useIsOnline()

  let body
  if (!can("products.create")) {
    body = (
      <EmptyState
        icon={<Ionicons name="lock-closed-outline" size={28} color={theme.textTertiary} />}
        message="You don't have permission to add products."
      />
    )
  } else if (!env.EXPO_PUBLIC_OFFLINE_MODE && !online) body = <NeedsInternet feature="Adding products" />
  else body = <ProductForm mode="create" prefill={{ gtin: gtin ?? null, name: name ?? null }} />

  return (
    <Screen edges={["top", "left", "right"]}>
      <ScreenHeader title="New product" />
      {body}
    </Screen>
  )
}
