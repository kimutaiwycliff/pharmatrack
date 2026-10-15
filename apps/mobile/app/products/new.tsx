import Ionicons from "@expo/vector-icons/Ionicons"
import { useLocalSearchParams } from "expo-router"
import { useState } from "react"
import { EmptyState, NeedsInternet, Screen, ScreenHeader, useIsOnline } from "../../src/components"
import { ProductForm } from "../../src/features/products/components/ProductForm"
import { useCan } from "../../src/hooks/useCan"
import { env } from "../../src/lib/env"
import { useTheme } from "../../src/theme/useTheme"

// Add a product (products.create). Optional `gtin` / `name` params prefill the
// form, e.g. from an unknown scan. Online it POSTs /api/products; the Offline
// Edition writes the local database (see features/products/data).
// "Save & add next" remounts a fresh form (keeping the supplier) and counts
// what was added, for entering a run of products in one sitting.
export default function NewProductScreen() {
  const { gtin, name } = useLocalSearchParams<{ gtin?: string; name?: string }>()
  const theme = useTheme()
  const can = useCan()
  const online = useIsOnline()
  const [run, setRun] = useState<{ count: number; last: string | null; supplierId: string | null }>({ count: 0, last: null, supplierId: null })

  let body
  if (!can("products.create")) {
    body = (
      <EmptyState
        icon={<Ionicons name="lock-closed-outline" size={28} color={theme.textTertiary} />}
        message="You don't have permission to add products."
      />
    )
  } else if (!env.EXPO_PUBLIC_OFFLINE_MODE && !online) body = <NeedsInternet feature="Adding products" />
  else
    body = (
      <ProductForm
        key={run.count}
        mode="create"
        prefill={run.count === 0 ? { gtin: gtin ?? null, name: name ?? null } : { supplier_id: run.supplierId }}
        onAddedNext={({ name: added, supplierId }) => setRun((r) => ({ count: r.count + 1, last: added, supplierId }))}
      />
    )

  return (
    <Screen edges={["top", "left", "right"]}>
      <ScreenHeader
        title="New product"
        subtitle={run.count > 0 ? `${run.count} added${run.last ? ` · last: ${run.last}` : ""}` : undefined}
      />
      {body}
    </Screen>
  )
}
