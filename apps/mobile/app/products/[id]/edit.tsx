import Ionicons from "@expo/vector-icons/Ionicons"
import { useLocalSearchParams } from "expo-router"
import { EmptyState, ErrorState, NeedsInternet, Screen, ScreenHeader, SkeletonList, useIsOnline } from "../../../src/components"
import { ProductForm } from "../../../src/features/products/components/ProductForm"
import { getProduct } from "../../../src/features/products/data"
import { useCan } from "../../../src/hooks/useCan"
import { useQuery } from "../../../src/hooks/useQuery"
import { env } from "../../../src/lib/env"
import { useTheme } from "../../../src/theme/useTheme"

// Edit a product (products.edit). Online it PATCHes /api/products/[id]; the
// Offline Edition writes the local database (see features/products/data).
export default function EditProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const theme = useTheme()
  const can = useCan()
  const online = useIsOnline()
  const allowed = can("products.edit")
  const needsNet = !env.EXPO_PUBLIC_OFFLINE_MODE && !online
  const q = useQuery(allowed && !needsNet ? `product:${id}` : null, () => getProduct(String(id)))

  let body
  if (!allowed) {
    body = (
      <EmptyState
        icon={<Ionicons name="lock-closed-outline" size={28} color={theme.textTertiary} />}
        message="You don't have permission to edit products."
      />
    )
  } else if (needsNet) body = <NeedsInternet feature="Editing products" />
  else if (q.loading) body = <SkeletonList rows={8} />
  else if (!q.data) body = <ErrorState message={q.error ?? "Product not found"} onRetry={q.retry} />
  else body = <ProductForm key={q.data.product.id} mode="edit" product={q.data.product} />

  return (
    <Screen edges={["top", "left", "right"]}>
      <ScreenHeader title="Edit product" subtitle={q.data?.product.name ?? null} />
      {body}
    </Screen>
  )
}
