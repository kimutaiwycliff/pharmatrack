import { router, useLocalSearchParams } from "expo-router"
import { NeedsInternet, Screen, ScreenHeader, useIsOnline } from "../../src/components"
import { OrderDetail } from "../../src/features/purchasing/components/OrderDetail"

// One purchase order on phones (tablets show OrderDetail beside the list in
// /purchase-orders). Online only, like the list.
export default function PurchaseOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const online = useIsOnline()
  if (!online) {
    return (
      <Screen>
        <ScreenHeader title="Purchase order" />
        <NeedsInternet feature="Purchase orders" />
      </Screen>
    )
  }
  return (
    <Screen>
      <OrderDetail id={String(id)} onDeleted={() => (router.canGoBack() ? router.back() : router.replace("/purchase-orders"))} />
    </Screen>
  )
}
