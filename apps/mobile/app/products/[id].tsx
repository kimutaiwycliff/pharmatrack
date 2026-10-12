import Ionicons from "@expo/vector-icons/Ionicons"
import { router, useLocalSearchParams } from "expo-router"
import { EmptyState, Screen, ScreenHeader } from "../../src/components"
import { ProductDetailView } from "../../src/features/products/components/ProductDetailView"
import { useCan } from "../../src/hooks/useCan"
import { useTheme } from "../../src/theme/useTheme"

// One product (phones; tablets show the same view inside /products).
export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const theme = useTheme()
  const can = useCan()
  return (
    <Screen edges={["top", "left", "right"]}>
      <ScreenHeader title="Product" />
      {can("products.view") ? (
        <ProductDetailView key={String(id)} productId={String(id)} onDeleted={() => router.back()} />
      ) : (
        <EmptyState
          icon={<Ionicons name="lock-closed-outline" size={28} color={theme.textTertiary} />}
          message="You don't have access to product management."
        />
      )}
    </Screen>
  )
}
