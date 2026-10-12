import { useLocalSearchParams } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"
import { EmptyState, Screen, ScreenHeader } from "../src/components"
import { BatchesView } from "../src/features/inventory/components/BatchesView"
import { useTheme } from "../src/theme/useTheme"

// Phone route for one product's batches (tablets show the same BatchesView in
// the Inventory tab's detail pane). Receiving moved to /receive-stock; edit
// and adjust live on each batch row — see features/inventory/components.
export default function ProductBatches() {
  const theme = useTheme()
  const { productId, productName } = useLocalSearchParams<{ productId?: string; productName?: string }>()

  if (!productId) {
    return (
      <Screen>
        <ScreenHeader title="Batches" />
        <EmptyState icon={<Ionicons name="cube-outline" size={32} color={theme.textTertiary} />} message="No product selected." />
      </Screen>
    )
  }

  return (
    <Screen>
      <BatchesView productId={productId} productName={productName ?? ""} variant="screen" />
    </Screen>
  )
}
