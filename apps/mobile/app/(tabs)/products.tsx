import Ionicons from "@expo/vector-icons/Ionicons"
import { router } from "expo-router"
import { useState } from "react"
import { EmptyState, IconButton, MasterDetail, Screen, ScreenHeader } from "../../src/components"
import { ProductDetailView } from "../../src/features/products/components/ProductDetailView"
import { ProductList } from "../../src/features/products/components/ProductList"
import type { ProductListItem } from "../../src/features/products/types"
import { useCan } from "../../src/hooks/useCan"
import { useIsTablet } from "../../src/hooks/useIsTablet"
import { useTheme } from "../../src/theme/useTheme"

// Products tab (it replaced Shift in the tab bar; Shift moved to More).
// Phones push /products/[id]; tablets keep the list on the left and the
// selected product on the right. List, detail and form logic live in
// src/features/products.
export default function ProductsScreen() {
  const theme = useTheme()
  const can = useCan()
  const tablet = useIsTablet()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const header = (
    <ScreenHeader
      title="Products"
      hideBack
      right={
        can("products.view") && can("products.create") ? (
          <IconButton icon="add" accessibilityLabel="Add product" onPress={() => router.push("/products/new")} />
        ) : null
      }
    />
  )

  if (!can("products.view")) {
    return (
      <Screen>
        {header}
        <EmptyState
          icon={<Ionicons name="lock-closed-outline" size={28} color={theme.textTertiary} />}
          message="You don't have access to product management."
        />
      </Screen>
    )
  }

  function open(p: ProductListItem) {
    if (tablet) setSelectedId(p.id)
    else router.push({ pathname: "/products/[id]", params: { id: p.id } })
  }

  if (!tablet) {
    return (
      <Screen edges={["top", "left", "right"]}>
        {header}
        <ProductList onSelect={open} />
      </Screen>
    )
  }

  return (
    <Screen edges={["top", "left", "right"]}>
      {header}
      <MasterDetail
        master={<ProductList selectedId={selectedId} onSelect={open} />}
        detail={selectedId ? <ProductDetailView key={selectedId} productId={selectedId} onDeleted={() => setSelectedId(null)} /> : null}
        placeholder={{
          icon: <Ionicons name="medkit-outline" size={40} color={theme.textTertiary} />,
          message: "Pick a product to see its prices, pack sizes and stock.",
        }}
      />
    </Screen>
  )
}
